import { CheckCircle2, Dumbbell, Plus, Save, Trash2 } from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from '../components/Button';
import { ExerciseCard } from '../components/ExerciseCard';
import { Modal } from '../components/Modal';
import { RestTimer } from '../components/RestTimer';
import { SetRow } from '../components/SetRow';
import { EmptyState, ErrorState, LoadingState } from '../components/States';
import { useRestTimer } from '../hooks/useRestTimer';
import { useSettings } from '../hooks/useSettings';
import { ApiRequestError, api } from '../services/api';
import type { DraftExercise, DraftSet, Exercise, PreviousPerformance } from '../types';
import { formatRelativeDate, nowLocalIso, todayIso } from '../utils/format';
import { SaveQueue } from '../utils/saveQueue';
import { isSetReady, round2, totalsForSets } from '../utils/workout';

let clientIdCounter = 0;
function nextClientId(): string {
  clientIdCounter += 1;
  return `draft-${clientIdCounter}-${Date.now()}`;
}

/** How many sets every exercise is performed with. */
const SETS_PER_EXERCISE = 3;

/** Creates an empty set for an exercise. */
function emptySet(setNumber: number): DraftSet {
  return {
    clientId: nextClientId(),
    set_number: setNumber,
    weight_kg: 0,
    reps: 0,
    is_completed: false,
  };
}

/** Creates the three empty sets an exercise starts with. */
function emptySets(): DraftSet[] {
  return [emptySet(1), emptySet(2), emptySet(3)];
}

export function ActiveWorkout() {
  const navigate = useNavigate();
  const { settings } = useSettings();
  const timer = useRestTimer(settings.rest_duration);

  const [sessionId, setSessionId] = useState<number | null>(null);
  // Mirrors sessionId so async callbacks always read the current value
  // instead of a stale closure capture.
  const sessionIdRef = useRef<number | null>(null);
  // Mirrors the draft state for the same reason: a click that changes a
  // value and immediately saves it must not read a stale copy.
  const draftRef = useRef<DraftExercise[]>([]);
  const [workoutDate, setWorkoutDate] = useState(todayIso());
  const [startedAt, setStartedAt] = useState<number | null>(null);
  const [elapsed, setElapsed] = useState(0);

  const [exercises, setExercises] = useState<Exercise[]>([]);
  // `draftRef` is the single source of truth for the draft; the `draft` state
  // mirrors it for rendering. Every mutation goes through `setDraftState` so
  // the two can never drift apart.
  const [draft, setDraft] = useState<DraftExercise[]>([]);
  const [previous, setPrevious] = useState<Record<number, PreviousPerformance | null>>({});

  const setDraftState = useCallback(
    (updater: DraftExercise[] | ((current: DraftExercise[]) => DraftExercise[])) => {
      const next =
        typeof updater === 'function'
          ? (updater as (current: DraftExercise[]) => DraftExercise[])(draftRef.current)
          : updater;
      draftRef.current = next;
      setDraft(next);
    },
    [],
  );

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [savedAt, setSavedAt] = useState<number | null>(null);

  const [pickerOpen, setPickerOpen] = useState(false);
  const [finishOpen, setFinishOpen] = useState(false);
  const [notes, setNotes] = useState('');

  // Every write to the server goes through this queue, so two saves can
  // never reach the server at the same time.
  const saveQueue = useRef(new SaveQueue()).current;

  // --- Load the exercise library and any active session --------------------
  useEffect(() => {
    const controller = new AbortController();

    const init = async () => {
      setLoading(true);
      setError(null);
      try {
        const library = await api.listExercises({}, controller.signal);
        setExercises(library);

        // Resume the unfinished session for today instead of creating a
        // second one. Every finished session keeps its own record, so a new
        // workout never overwrites an old one.
        const active = await api.getOpenWorkout(todayIso(), controller.signal);

        if (active) {
          setSessionId(active.id);
          sessionIdRef.current = active.id;
          setWorkoutDate(active.workout_date);
          setStartedAt(active.start_time ? new Date(active.start_time).getTime() : Date.now());

          const grouped = new Map<number, DraftExercise>();
          for (const record of active.exercises) {
            grouped.set(record.exercise_id, {
              exercise_id: record.exercise_id,
              exercise_name: record.exercise_name,
              muscle_group: record.muscle_group,
              is_dumbbell: record.is_dumbbell,
              sets: record.sets.map((set) => ({
                clientId: nextClientId(),
                id: set.id,
                set_number: set.set_number,
                weight_kg: set.weight_kg,
                reps: set.reps,
                is_completed: set.is_completed,
              })),
            });
          }

          setDraftState(
            [...grouped.values()].map((entry) => ({
              ...entry,
              sets: entry.sets.sort((a, b) => a.set_number - b.set_number),
            })),
          );
          setNotes(active.notes ?? '');

          void loadPrevious(
            [...grouped.keys()],
            active.workout_date,
          );
        }
      } catch (err) {
        if (err instanceof DOMException && err.name === 'AbortError') return;
        setError(
          err instanceof ApiRequestError
            ? err.displayMessage
            : 'Could not load the workout screen.',
        );
      } finally {
        setLoading(false);
      }
    };

    void init();
    return () => controller.abort();
    // `loadPrevious` is stable, so this effect only runs once.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [setDraftState]);

  // --- Elapsed time ticker -------------------------------------------------
  useEffect(() => {
    if (startedAt === null) return;
    const tick = () => setElapsed(Math.floor((Date.now() - startedAt) / 1000));
    tick();
    const id = window.setInterval(tick, 1000);
    return () => window.clearInterval(id);
  }, [startedAt]);

  // --- Load previous performance for the selected exercises ----------------
  const loadPrevious = useCallback(async (exerciseIds: number[], date: string) => {
    if (exerciseIds.length === 0) return;
    const results = await Promise.all(
      exerciseIds.map(async (id) => {
        try {
          return [id, await api.getPreviousPerformance(id, date)] as const;
        } catch {
          return [id, null] as const;
        }
      }),
    );
    setPrevious(Object.fromEntries(results));
  }, []);

  // --- Session creation ----------------------------------------------------
  const ensureSession = useCallback(async (): Promise<number> => {
    if (sessionId !== null) return sessionId;

    const created = await api.createWorkout({
      workout_date: workoutDate,
      start_time: nowLocalIso(),
      status: 'in_progress',
    });
    setSessionId(created.id);
    sessionIdRef.current = created.id;
    setStartedAt(Date.now());
    return created.id;
  }, [sessionId, workoutDate]);

  // --- Add an exercise -----------------------------------------------------
  const addExercise = async (exercise: Exercise) => {
    setSaveError(null);
    try {
      await ensureSession();
      setDraftState((current) => {
        if (current.some((entry) => entry.exercise_id === exercise.id)) return current;
        return [
          ...current,
          {
            exercise_id: exercise.id,
            exercise_name: exercise.name,
            muscle_group: exercise.muscle_group,
            is_dumbbell: exercise.is_dumbbell,
            sets: emptySets(),
          },
        ];
      });
      void loadPrevious([exercise.id], workoutDate);
    } catch (err) {
      setSaveError(
        err instanceof ApiRequestError ? err.displayMessage : 'Could not add the exercise.',
      );
    }
  };

  const removeExercise = async (exerciseId: number) => {
    setDraftState((current) => current.filter((entry) => entry.exercise_id !== exerciseId));
    setSaveError(null);

    // Remove the persisted sets for this exercise as well.
    const activeSessionId = sessionIdRef.current;
    if (activeSessionId === null) return;
    try {
      const sets = await api.listSets(activeSessionId);
      const toDelete = sets.filter((set) => set.exercise_id === exerciseId);
      await Promise.all(toDelete.map((set) => api.deleteSet(set.id)));
    } catch (err) {
      setSaveError(
        err instanceof ApiRequestError ? err.displayMessage : 'Could not remove the exercise.',
      );
    }
  };

  // --- Set editing ---------------------------------------------------------
  const updateSet = (exerciseId: number, clientId: string, changes: Partial<DraftSet>) => {
    setDraftState((current) =>
      current.map((entry) =>
        entry.exercise_id === exerciseId
          ? {
              ...entry,
              sets: entry.sets.map((set) =>
                set.clientId === clientId ? { ...set, ...changes, dirty: true } : set,
              ),
            }
          : entry,
      ),
    );
  };

  /**
   * Writes the three sets of one exercise to the server in one request.
   * The server keeps exactly three sets, so the exercise always looks the
   * same after a reload.
   *
   * Writes are queued so two overlapping saves can never race each other —
   * the second one waits for the first to finish and then writes the
   * latest values.
   */
  const persistExercise = async (entry: DraftExercise): Promise<boolean> => {
    const activeSessionId = sessionIdRef.current;
    if (activeSessionId === null) return false;

    // Only sets that have a weight and a rep count are worth saving; a
    // half-entered set would otherwise be stored as a zero-weight set.
    // The set number is kept as it is, so a set that is still empty does
    // not make the following sets move up.
    const sets = entry.sets
      .filter((set) => isSetReady(set))
      .map((set) => ({
        set_number: set.set_number,
        weight_kg: set.weight_kg,
        reps: set.reps,
        is_completed: set.is_completed,
      }));

    if (sets.length === 0) return true;

    try {
      const saved = await saveQueue.run(async () => {
        const result = await api.saveExerciseSets(activeSessionId, {
          exercise_id: entry.exercise_id,
          sets,
        });
        return result;
      });

      setDraftState((current) =>
        current.map((item) =>
          item.exercise_id === entry.exercise_id
            ? {
                ...item,
                sets: item.sets.map((set) => {
                  const match = saved.find((row) => row.set_number === set.set_number);
                  return match
                    ? {
                        ...set,
                        id: match.id,
                        weight_kg: match.weight_kg,
                        reps: match.reps,
                        is_completed: match.is_completed,
                        dirty: false,
                      }
                    : set;
                }),
              }
            : item,
        ),
      );
      return true;
    } catch (err) {
      setSaveError(
        err instanceof ApiRequestError ? err.displayMessage : 'Could not save the sets.',
      );
      return false;
    }
  };

  /**
   * Writes a single set to the server when it changes or loses focus.
   * The values are supplied by the caller so the write always reflects what
   * the user just entered, never a stale copy of the draft state.
   */
  const commitSet = async (
    exerciseId: number,
    clientId: string,
    values: { weight_kg: number; reps: number; is_completed: boolean },
  ) => {
    const entry = draftRef.current.find((item) => item.exercise_id === exerciseId);
    if (!entry) return;

    // The change is applied to the live draft first, so the copy that gets
    // written always contains the values the user just entered alongside
    // the other sets of this exercise.
    setDraftState((current) =>
      current.map((item) =>
        item.exercise_id === exerciseId
          ? {
              ...item,
              sets: item.sets.map((set) =>
                set.clientId === clientId ? { ...set, ...values, dirty: true } : set,
              ),
            }
          : item,
      ),
    );

    const updated = draftRef.current.find((item) => item.exercise_id === exerciseId);
    if (!updated) return;

    // A set that is ticked off but has no numbers yet is stored as it is, so
    // the tick is not lost. Everything else waits for a usable value.
    const target = updated.sets.find((set) => set.clientId === clientId);
    if (target && !isSetReady(target) && !values.is_completed) return;

    await persistExercise(updated);
  };

  /** Saves every exercise that has usable sets. */
  const saveAllSets = async (): Promise<boolean> => {
    // The ref holds the latest draft, so the save never works from a
    // stale copy of the state.
    const current = draftRef.current;
    if (current.length === 0) return true;
    setSaving(true);
    setSaveError(null);
    try {
      await ensureSession();
      for (const entry of current) {
        const ok = await persistExercise(entry);
        if (!ok) return false;
      }
      setSavedAt(Date.now());
      return true;
    } catch (err) {
      setSaveError(
        err instanceof ApiRequestError ? err.displayMessage : 'Could not save the workout.',
      );
      return false;
    } finally {
      setSaving(false);
    }
  };

  // --- Totals --------------------------------------------------------------
  const totals = useMemo(() => {
    let completed = 0;
    let volume = 0;
    let reps = 0;
    for (const entry of draft) {
      const entryTotals = totalsForSets(entry.sets, entry.is_dumbbell);
      completed += entryTotals.completed;
      volume += entryTotals.volume;
      reps += entryTotals.reps;
    }
    return { completed, volume: round2(volume), reps };
  }, [draft]);

  const elapsedLabel = `${Math.floor(elapsed / 60)}:${String(elapsed % 60).padStart(2, '0')}`;

  // --- Finish the workout --------------------------------------------------
  const finishWorkout = async () => {
    setSaving(true);
    setSaveError(null);
    try {
      const id = await ensureSession();
      const saved = await saveAllSets();
      if (!saved) return;

      await api.updateWorkout(id, {
        duration_minutes: Math.max(1, Math.round(elapsed / 60)),
        notes: notes.trim() || null,
        status: 'completed',
      });
      setFinishOpen(false);
      navigate('/history');
    } catch (err) {
      setSaveError(
        err instanceof ApiRequestError ? err.displayMessage : 'Could not finish the workout.',
      );
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return <LoadingState label="Preparing your workout…" />;
  }

  if (error) {
    return <ErrorState message={error} onRetry={() => window.location.reload()} />;
  }

  const selectedIds = new Set(draft.map((entry) => entry.exercise_id));

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-ink">Active Workout</h1>
          <p className="text-sm text-ink-muted">
            {formatRelativeDate(workoutDate)}
            {startedAt !== null ? (
              <span className="ml-2 font-mono tabular-nums">{elapsedLabel}</span>
            ) : null}
          </p>
        </div>
        <Button
          onClick={() => setFinishOpen(true)}
          disabled={draft.length === 0}
          className="shrink-0"
        >
          <CheckCircle2 className="h-4 w-4" aria-hidden="true" />
          Finish
        </Button>
      </div>

      {saveError ? (
        <p role="alert" className="rounded-xl bg-danger/10 p-3 text-sm text-danger">
          {saveError}
        </p>
      ) : null}

      <RestTimer
        timer={timer}
        onStart={() => timer.start()}
        onPause={timer.pause}
        onResume={timer.resume}
        onReset={timer.reset}
        onDurationChange={timer.setDuration}
      />

      {draft.length === 0 ? (
        <EmptyState
          title="No exercises yet"
          description="Add the exercises you are training today, then log your sets."
          action={
            <Button onClick={() => setPickerOpen(true)} className="mt-2">
              <Plus className="h-4 w-4" aria-hidden="true" />
              Add Exercise
            </Button>
          }
        />
      ) : (
        <>
          <div className="flex items-center justify-between rounded-xl bg-surface-raised px-4 py-3 text-sm">
            <span className="text-ink-muted">
              <span className="font-semibold text-ink tabular-nums">{totals.completed}</span> sets
              done
            </span>
            <span className="text-ink-muted">
              <span className="font-semibold text-ink tabular-nums">{totals.reps}</span> reps
            </span>
            <span className="text-ink-muted">
              Volume{' '}
              <span className="font-semibold text-accent tabular-nums">
                {Math.round(totals.volume).toLocaleString()} kg
              </span>
            </span>
          </div>

          {draft.map((entry) => {
            const previousEntry = previous[entry.exercise_id];
            const entryTotals = totalsForSets(entry.sets, entry.is_dumbbell);
            const missing = entry.sets.filter((set) => !isSetReady(set)).length;

            return (
              <section
                key={entry.exercise_id}
                className="rounded-2xl border border-border-subtle bg-surface-raised p-4"
              >
                <div className="mb-3 flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <h2 className="truncate font-bold text-ink">{entry.exercise_name}</h2>
                    <p className="mt-0.5 text-xs text-ink-faint">
                      {entry.is_dumbbell ? 'Weight per dumbbell' : 'Weight in kg'} ·{' '}
                      {entry.sets.length} sets
                    </p>
                    {previousEntry ? (
                      <p className="mt-0.5 text-xs text-ink-faint">
                        Last time: {formatRelativeDate(previousEntry.workout_date)} ·{' '}
                        {previousEntry.sets.length} sets
                      </p>
                    ) : (
                      <p className="mt-0.5 text-xs text-ink-faint">
                        First time logging this exercise
                      </p>
                    )}
                  </div>
                  <button
                    type="button"
                    onClick={() => void removeExercise(entry.exercise_id)}
                    aria-label={`Remove ${entry.exercise_name}`}
                    className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-ink-faint transition-colors hover:bg-danger/15 hover:text-danger"
                  >
                    <Trash2 className="h-4 w-4" aria-hidden="true" />
                  </button>
                </div>

                <div className="space-y-2">
                  {entry.sets.map((set, index) => (
                    <SetRow
                      key={set.clientId}
                      set={set}
                      previous={previousEntry?.sets[index] ?? null}
                      isDumbbell={entry.is_dumbbell}
                      onChange={(clientId, changes) => {
                        updateSet(entry.exercise_id, clientId, changes);
                      }}
                      onCommit={(clientId, values) => {
                        void commitSet(entry.exercise_id, clientId, values);
                      }}
                      onRemove={() => {
                        // Every exercise is performed with exactly three
                        // sets, so a set cannot be removed.
                        return;
                      }}
                      removable={entry.sets.length > SETS_PER_EXERCISE}
                    />
                  ))}
                </div>

                <div className="mt-3 flex items-center justify-between gap-3 rounded-xl bg-surface px-3.5 py-2.5 text-sm">
                  <span className="text-ink-muted">
                    <span className="font-semibold text-ink tabular-nums">
                      {entryTotals.reps}
                    </span>{' '}
                    reps
                  </span>
                  <span className="text-ink-muted">
                    Volume{' '}
                    <span className="font-semibold text-accent tabular-nums">
                      {Math.round(entryTotals.volume).toLocaleString()} kg
                    </span>
                  </span>
                </div>

                {missing > 0 ? (
                  <p className="mt-2 text-xs text-warning">
                    {missing} set{missing === 1 ? '' : 's'} still need a weight and reps.
                  </p>
                ) : null}
              </section>
            );
          })}

          <Button
            variant="secondary"
            fullWidth
            size="lg"
            onClick={() => setPickerOpen(true)}
          >
            <Dumbbell className="h-4 w-4" aria-hidden="true" />
            Add Another Exercise
          </Button>

          <Button fullWidth size="lg" onClick={() => void saveAllSets()} disabled={saving}>
            <Save className="h-4 w-4" aria-hidden="true" />
            {saving ? 'Saving…' : 'Save Workout'}
          </Button>

          {savedAt !== null ? (
            <p className="text-center text-sm text-success">
              Saved just now — your sets are stored.
            </p>
          ) : null}
        </>
      )}

      <Modal open={pickerOpen} title="Add Exercise" onClose={() => setPickerOpen(false)}>
        <ul className="space-y-2">
          {exercises.map((exercise) => (
            <li key={exercise.id}>
              <ExerciseCard
                exercise={exercise}
                selectable
                selected={selectedIds.has(exercise.id)}
                onToggle={(target) => {
                  if (selectedIds.has(target.id)) return;
                  void addExercise(target);
                }}
              />
            </li>
          ))}
        </ul>
      </Modal>

      <Modal
        open={finishOpen}
        title="Finish Workout"
        onClose={() => setFinishOpen(false)}
        footer={
          <div className="flex gap-2">
            <Button variant="secondary" fullWidth onClick={() => setFinishOpen(false)}>
              Keep Training
            </Button>
            <Button fullWidth onClick={() => void finishWorkout()} disabled={saving}>
              {saving ? 'Saving…' : 'Save Workout'}
            </Button>
          </div>
        }
      >
        <div className="space-y-4">
          <div className="grid grid-cols-3 gap-2 text-center">
            <div className="rounded-xl bg-surface p-2.5">
              <p className="text-[11px] uppercase tracking-wide text-ink-faint">Duration</p>
              <p className="mt-0.5 text-lg font-bold text-ink tabular-nums">{elapsedLabel}</p>
            </div>
            <div className="rounded-xl bg-surface p-2.5">
              <p className="text-[11px] uppercase tracking-wide text-ink-faint">Sets</p>
              <p className="mt-0.5 text-lg font-bold text-ink tabular-nums">
                {totals.completed}
              </p>
            </div>
            <div className="rounded-xl bg-surface p-2.5">
              <p className="text-[11px] uppercase tracking-wide text-ink-faint">Volume</p>
              <p className="mt-0.5 text-lg font-bold text-accent tabular-nums">
                {Math.round(totals.volume).toLocaleString()}
              </p>
            </div>
          </div>
          <div>
            <label htmlFor="workout-notes" className="mb-1.5 block text-sm font-medium text-ink-muted">
              Notes (optional)
            </label>
            <textarea
              id="workout-notes"
              value={notes}
              onChange={(event) => setNotes(event.target.value)}
              rows={3}
              placeholder="How did the session feel?"
              className="w-full rounded-xl border border-border-subtle bg-surface px-3.5 py-3 text-ink placeholder:text-ink-faint focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/30"
            />
          </div>
          {saveError ? (
            <p role="alert" className="rounded-xl bg-danger/10 p-3 text-sm text-danger">
              {saveError}
            </p>
          ) : null}
        </div>
      </Modal>
    </div>
  );
}
