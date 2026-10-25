import {
  ArrowLeft,
  CheckCircle2,
  ChevronRight,
  History,
  Minus,
  Save,
  Trash2,
  TrendingDown,
  TrendingUp,
} from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { Button } from '../components/Button';
import { Card } from '../components/Card';
import { DayHistoryModal } from '../components/DayHistoryModal';
import { Modal } from '../components/Modal';
import { EmptyState, ErrorState, LoadingState } from '../components/States';
import { ApiRequestError, api } from '../services/api';
import type {
  DayPreviousSession,
  DayProgramme,
  DayProgrammeExercise,
  PreviousSet,
} from '../types';
import { formatDate, formatNumber, formatRelativeDate } from '../utils/format';
import { SaveQueue } from '../utils/saveQueue';
import { isSetReady, round2, setVolume } from '../utils/workout';

let setCounter = 0;
function nextClientId(): string {
  setCounter += 1;
  return `set-${setCounter}-${Date.now()}`;
}

/** How many sets every exercise is performed with. */
const SETS_PER_EXERCISE = 3;

/** A set the user is editing. */
interface EditableSet {
  clientId: string;
  set_number: number;
  weight_kg: number;
  reps: number;
  is_completed: boolean;
  dirty: boolean;
}

/** An exercise of the day, with the sets the user is entering. */
interface EditableExercise {
  exercise_id: number;
  name: string;
  muscle_group: string | null;
  is_dumbbell: boolean;
  sets: EditableSet[];
}

/** The save state shown in the status line. */
type SaveStatus = 'idle' | 'saving' | 'saved' | 'error';

/** Builds the sets of an exercise from the previous session's values. */
function setsFromPrevious(previous: PreviousSet[] | undefined): EditableSet[] {
  return [1, 2, 3].map((number) => {
    const match = previous?.find((set) => set.set_number === number);
    return {
      clientId: nextClientId(),
      set_number: number,
      weight_kg: match?.weight_kg ?? 0,
      reps: match?.reps ?? 0,
      is_completed: false,
      dirty: false,
    };
  });
}

/** A small badge showing an increase, a decrease or no change. */
function DeltaBadge({
  value,
  suffix = '',
  title,
}: {
  value: number | null;
  suffix?: string;
  title: string;
}) {
  if (value === null) {
    return (
      <span className="text-xs text-ink-faint" title={title}>
        —
      </span>
    );
  }

  const flat = value === 0;
  const up = value > 0;
  const color = flat ? 'text-ink-faint' : up ? 'text-success' : 'text-warning';
  const Icon = flat ? Minus : up ? TrendingUp : TrendingDown;

  return (
    <span
      className={`inline-flex items-center gap-1 text-xs font-semibold tabular-nums ${color}`}
      title={title}
    >
      <Icon className="h-3 w-3" aria-hidden="true" />
      {up ? '+' : ''}
      {formatNumber(Math.round(value * 100) / 100)}
      {suffix}
    </span>
  );
}

export function DayWorkout() {
  const params = useParams<{ day: string }>();
  const navigate = useNavigate();
  const day = Number(params.day ?? '1');

  const [programme, setProgramme] = useState<DayProgramme | null>(null);
  const [previous, setPrevious] = useState<DayPreviousSession | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // The id of the session being written to. The ref holds the current
  // value so a save never works with a stale one.
  const sessionIdRef = useRef<number | null>(null);

  // The draft is the single source of truth. The ref always holds the
  // latest value, so a save never works from a stale copy.
  const [draft, setDraft] = useState<EditableExercise[]>([]);
  const draftRef = useRef<EditableExercise[]>([]);

  const [saveStatus, setSaveStatus] = useState<SaveStatus>('idle');
  const [saveMessage, setSaveMessage] = useState<string | null>(null);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [discardOpen, setDiscardOpen] = useState(false);
  const [completeOpen, setCompleteOpen] = useState(false);
  const [notes, setNotes] = useState('');

  // Every write goes through this queue, so two saves never reach the
  // server at the same time.
  const saveQueue = useRef(new SaveQueue()).current;

  const setDraftState = useCallback(
    (updater: EditableExercise[] | ((current: EditableExercise[]) => EditableExercise[])) => {
      const next =
        typeof updater === 'function'
          ? (updater as (current: EditableExercise[]) => EditableExercise[])(draftRef.current)
          : updater;
      draftRef.current = next;
      setDraft(next);
    },
    [],
  );

  // --- Load the programme and the previous session -------------------------
  useEffect(() => {
    const controller = new AbortController();

    const init = async () => {
      setLoading(true);
      setError(null);
      try {
        const [programmeData, previousData] = await Promise.all([
          api.getDayProgramme(day, controller.signal),
          api.getDayPreviousSession(day, undefined, controller.signal),
        ]);

        setProgramme(programmeData);
        setPrevious(previousData);

        // Start from the previous values, so the user only has to change
        // what they want to change.
        const exercises: EditableExercise[] = programmeData.exercises.map((entry) => {
          const before = previousData?.exercises.find(
            (item) => item.exercise_id === entry.exercise_id,
          );
          return {
            exercise_id: entry.exercise_id,
            name: entry.name,
            muscle_group: entry.muscle_group,
            is_dumbbell: entry.is_dumbbell,
            sets: setsFromPrevious(before?.sets),
          };
        });

        setDraftState(exercises);
      } catch (err) {
        if (err instanceof DOMException && err.name === 'AbortError') return;
        setError(
          err instanceof ApiRequestError
            ? err.displayMessage
            : 'Could not load this workout.',
        );
      } finally {
        setLoading(false);
      }
    };

    void init();
    return () => controller.abort();
  }, [day, setDraftState]);

  // --- Session handling ----------------------------------------------------
  /**
   * Returns the session of this day. An unfinished session is resumed,
   * and a new one is only created when there is none.
   *
   * The promise is kept so two calls that arrive at the same time — for
   * example a blur on the weight field and a click on the done toggle —
   * share one request instead of creating two sessions.
   */
  const sessionPromiseRef = useRef<Promise<number> | null>(null);

  const ensureSession = useCallback(async (): Promise<number> => {
    if (sessionIdRef.current !== null) return sessionIdRef.current;

    if (sessionPromiseRef.current) return sessionPromiseRef.current;

    const request = (async () => {
      const today = new Date();
      const month = String(today.getMonth() + 1).padStart(2, '0');
      const dateDay = String(today.getDate()).padStart(2, '0');
      const workoutDate = `${today.getFullYear()}-${month}-${dateDay}`;

      const created = await api.createWorkout({
        workout_date: workoutDate,
        day_of_week: day,
        start_time: `${workoutDate}T${String(today.getHours()).padStart(2, '0')}:${String(today.getMinutes()).padStart(2, '0')}`,
        status: 'in_progress',
      });

      sessionIdRef.current = created.id;
      return created.id;
    })();

    sessionPromiseRef.current = request;

    try {
      return await request;
    } finally {
      sessionPromiseRef.current = null;
    }
  }, [day]);

  // --- Saving --------------------------------------------------------------
  /**
   * Writes the three sets of one exercise to the server.
   *
   * Only sets that have a weight and a rep count are written, so a blank
   * input is never stored as a zero-weight set.
   */
  const persistExercise = async (
    entry: EditableExercise,
  ): Promise<{ ok: boolean; message?: string }> => {
    const activeSessionId = sessionIdRef.current;
    if (activeSessionId === null) {
      return { ok: false, message: 'No open session for this day.' };
    }

    const sets = entry.sets
      .filter((set) => isSetReady(set))
      .map((set) => ({
        set_number: set.set_number,
        weight_kg: set.weight_kg,
        reps: set.reps,
        is_completed: set.is_completed,
      }));

    if (sets.length === 0) return { ok: true };

    try {
      const saved = await saveQueue.run(() =>
        api.saveExerciseSets(activeSessionId, {
          exercise_id: entry.exercise_id,
          sets,
        }),
      );

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
      return { ok: true };
    } catch (err) {
      return {
        ok: false,
        message:
          err instanceof ApiRequestError ? err.displayMessage : 'Could not save the sets.',
      };
    }
  };

  /**
   * Counts the saves that are in flight.
   *
   * The status line is driven by this count, so two overlapping saves
   * cannot leave the bar showing "Saving…" after both have finished.
   */
  const pendingSavesRef = useRef(0);
  const [, setPendingSaves] = useState(0);

  const beginSave = () => {
    pendingSavesRef.current += 1;
    setPendingSaves(pendingSavesRef.current);
    setSaveStatus('saving');
  };

  const endSave = (ok: boolean, message?: string) => {
    pendingSavesRef.current = Math.max(0, pendingSavesRef.current - 1);
    setPendingSaves(pendingSavesRef.current);

    // While another save is still running the status stays on "saving".
    if (pendingSavesRef.current > 0) return;

    if (ok) {
      setSaveStatus('saved');
      setSaveMessage(message ?? 'Saved');
    } else {
      setSaveStatus('error');
      setSaveMessage(message ?? 'Could not save the workout.');
    }
  };

  /** Saves every exercise of the day. */
  const saveProgress = async (): Promise<boolean> => {
    beginSave();
    setSaveMessage(null);
    try {
      await ensureSession();
      for (const entry of draftRef.current) {
        const result = await persistExercise(entry);
        if (!result.ok) {
          endSave(false, result.message);
          return false;
        }
      }
      endSave(true, 'Progress saved');
      return true;
    } catch (err) {
      endSave(
        false,
        err instanceof ApiRequestError ? err.displayMessage : 'Could not save the workout.',
      );
      return false;
    }
  };

  /** Writes one set as soon as it is finished with. */
  const commitSet = async (
    exerciseId: number,
    clientId: string,
    values: { weight_kg: number; reps: number; is_completed: boolean },
  ) => {
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

    const target = updated.sets.find((set) => set.clientId === clientId);
    // A set without numbers cannot be saved yet, so it waits for the user
    // to fill it in.
    if (target && !isSetReady(target)) return;

    beginSave();
    try {
      // The session is created on the first write, so a workout can be
      // started by entering a value and nothing else.
      await ensureSession();
      const result = await persistExercise(updated);
      endSave(result.ok, result.ok ? 'Saved' : result.message);
    } catch (err) {
      endSave(
        false,
        err instanceof ApiRequestError ? err.displayMessage : 'Could not save the set.',
      );
    }
  };

  // --- Discarding ----------------------------------------------------------
  /**
   * Throws the entered values away and starts again from the previous
   * session. The saved history is never touched.
   */
  const discardDraft = async () => {
    setSaveMessage(null);
    try {
      // The unsaved draft only ever lives in the browser, so discarding it
      // means putting the inputs back to the previous values.
      const exercises: EditableExercise[] = (programme?.exercises ?? []).map((entry) => {
        const before = previous?.exercises.find(
          (item) => item.exercise_id === entry.exercise_id,
        );
        return {
          exercise_id: entry.exercise_id,
          name: entry.name,
          muscle_group: entry.muscle_group,
          is_dumbbell: entry.is_dumbbell,
          sets: setsFromPrevious(before?.sets),
        };
      });

      setDraftState(exercises);
      setDiscardOpen(false);
      setSaveStatus('idle');
      setSaveMessage('Draft discarded');
    } finally {
      setSaveStatus('idle');
    }
  };

  // --- Completing ----------------------------------------------------------
  const completeWorkout = async () => {
    beginSave();
    setSaveMessage(null);
    try {
      const id = await ensureSession();
      // The sets are written first, so the finished session holds
      // everything the user entered.
      const saved = await saveProgress();
      if (!saved) {
        endSave(false, saveMessage ?? 'Could not save the workout.');
        return;
      }

      await api.updateWorkout(id, {
        duration_minutes: 60,
        notes: notes.trim() || null,
        status: 'completed',
      });

      setCompleteOpen(false);
      endSave(true, 'Workout saved');
      navigate(`/history/day/${day}`);
    } catch (err) {
      endSave(
        false,
        err instanceof ApiRequestError
          ? err.displayMessage
          : 'Could not finish the workout.',
      );
    }
  };

  // --- Totals --------------------------------------------------------------
  const totals = useMemo(() => {
    let totalVolume = 0;
    let totalReps = 0;
    let completedSets = 0;
    let completedExercises = 0;
    let expectedSets = 0;

    for (const entry of draft) {
      expectedSets += SETS_PER_EXERCISE;
      let exerciseDone = 0;

      for (const set of entry.sets) {
        if (!set.is_completed || !isSetReady(set)) continue;
        completedSets += 1;
        exerciseDone += 1;
        totalReps += set.reps;
        totalVolume += setVolume(set.weight_kg, set.reps, entry.is_dumbbell);
      }

      if (exerciseDone > 0) completedExercises += 1;
    }

    const totalExercises = draft.length;
    // The completion is measured against the sets of the whole day.
    const completionPercent = expectedSets === 0 ? 0 : (completedSets / expectedSets) * 100;

    return {
      totalVolume: round2(totalVolume),
      totalReps,
      completedSets,
      completedExercises,
      totalExercises,
      completionPercent,
    };
  }, [draft]);

  const hasUnsavedChanges = draft.some((entry) => entry.sets.some((set) => set.dirty));

  if (loading) {
    return <LoadingState label="Loading your workout…" />;
  }

  if (error) {
    return <ErrorState message={error} onRetry={() => window.location.reload()} />;
  }

  if (!programme) {
    return <ErrorState message="This day could not be loaded." />;
  }

  return (
    <div className="space-y-4 pb-28">
      {/* --- Day header ---------------------------------------------- */}
      <div>
        <Link
          to="/"
          className="inline-flex items-center gap-1.5 text-sm font-medium text-ink-muted transition-colors hover:text-ink"
        >
          <ArrowLeft className="h-4 w-4" aria-hidden="true" />
          Dashboard
        </Link>

        <div className="mt-2 flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h1 className="text-xl font-bold text-ink">
              {programme.day_name} — {programme.title}
            </h1>
            <p className="mt-0.5 text-sm text-ink-muted">
              {programme.exercises.length} exercises
              {programme.estimated_minutes ? ` · ~${programme.estimated_minutes} min` : ''}
            </p>
          </div>
          <Button variant="secondary" size="sm" onClick={() => setHistoryOpen(true)}>
            <History className="h-4 w-4" aria-hidden="true" />
            History
          </Button>
        </div>
      </div>

      {/* --- Previous workout ------------------------------------------ */}
      {previous ? (
        <Card className="p-4">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-xs font-medium uppercase tracking-wide text-accent">
                Last workout
              </p>
              <p className="mt-0.5 font-semibold text-ink">
                {formatDate(previous.workout_date)}
              </p>
              <p className="text-xs text-ink-faint">
                {formatRelativeDate(previous.workout_date)}
              </p>
            </div>
            <Button variant="ghost" size="sm" onClick={() => setHistoryOpen(true)}>
              View all
              <ChevronRight className="h-4 w-4" aria-hidden="true" />
            </Button>
          </div>

          <div className="mt-3 grid grid-cols-4 gap-2 text-center">
            <div className="rounded-xl bg-surface p-2.5">
              <p className="text-[11px] uppercase tracking-wide text-ink-faint">Exercises</p>
              <p className="mt-0.5 text-base font-bold text-ink tabular-nums">
                {previous.total_exercises}
              </p>
            </div>
            <div className="rounded-xl bg-surface p-2.5">
              <p className="text-[11px] uppercase tracking-wide text-ink-faint">Sets</p>
              <p className="mt-0.5 text-base font-bold text-ink tabular-nums">
                {previous.completed_sets}
                <span className="text-xs font-normal text-ink-faint">/{previous.total_sets}</span>
              </p>
            </div>
            <div className="rounded-xl bg-surface p-2.5">
              <p className="text-[11px] uppercase tracking-wide text-ink-faint">Reps</p>
              <p className="mt-0.5 text-base font-bold text-ink tabular-nums">
                {previous.total_reps}
              </p>
            </div>
            <div className="rounded-xl bg-surface p-2.5">
              <p className="text-[11px] uppercase tracking-wide text-ink-faint">Volume</p>
              <p className="mt-0.5 text-base font-bold text-accent tabular-nums">
                {Math.round(previous.total_volume).toLocaleString()}
              </p>
            </div>
          </div>
        </Card>
      ) : (
        <Card className="p-4">
          <p className="font-semibold text-ink">No previous workout</p>
          <p className="mt-0.5 text-sm text-ink-muted">
            This is the first time you train {programme.day_name}. Your values will be saved here.
          </p>
        </Card>
      )}

      {/* --- Today's totals -------------------------------------------- */}
      <div className="flex items-center justify-between rounded-xl bg-surface-raised px-4 py-3 text-sm">
        <span className="text-ink-muted">
          <span className="font-semibold text-ink tabular-nums">
            {totals.completedSets}
          </span>{' '}
          / {totals.totalExercises * SETS_PER_EXERCISE} sets
        </span>
        <span className="text-ink-muted">
          <span className="font-semibold text-ink tabular-nums">{totals.totalReps}</span> reps
        </span>
        <span className="text-ink-muted">
          <span className="font-semibold text-accent tabular-nums">
            {Math.round(totals.totalVolume).toLocaleString()}
          </span>{' '}
          kg
        </span>
      </div>

      {/* --- Exercises ------------------------------------------------- */}
      {programme.exercises.length === 0 ? (
        <Card>
          <EmptyState
            title="No exercises on this day"
            description="This day is a rest day. Pick a training day from the weekly schedule on the dashboard."
          />
        </Card>
      ) : (
        programme.exercises.map((entry: DayProgrammeExercise) => {
          const exercise = draft.find((item) => item.exercise_id === entry.exercise_id);
          if (!exercise) return null;

          const before = previous?.exercises.find(
            (item) => item.exercise_id === entry.exercise_id,
          );

          const exerciseVolume = exercise.sets
            .filter((set) => set.is_completed && isSetReady(set))
            .reduce((sum, set) => sum + setVolume(set.weight_kg, set.reps, entry.is_dumbbell), 0);

          const previousVolume = before?.total_volume ?? null;
          const volumeDelta =
            previousVolume !== null ? round2(exerciseVolume - previousVolume) : null;
          const volumePercent =
            previousVolume !== null && previousVolume > 0 && volumeDelta !== null
              ? round2((volumeDelta / previousVolume) * 100)
              : null;

          return (
            <section
              key={entry.exercise_id}
              className="rounded-2xl border border-border-subtle bg-surface-raised p-4"
            >
              <div className="mb-3">
                <div className="flex items-start justify-between gap-3">
                  <h2 className="min-w-0 truncate font-bold text-ink">{entry.name}</h2>
                  <p className="shrink-0 text-sm font-semibold text-accent tabular-nums">
                    {Math.round(exerciseVolume).toLocaleString()} kg
                  </p>
                </div>
                <p className="mt-0.5 text-xs text-ink-faint">
                  {entry.muscle_group ?? 'Exercise'} · {SETS_PER_EXERCISE} sets
                  {entry.is_dumbbell ? ' · weight per dumbbell' : ''}
                </p>

                {/* The comparison with the previous session. */}
                {before ? (
                  <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs">
                    <span className="text-ink-faint">
                      Previous:{' '}
                      <span className="font-medium text-ink-muted">
                        {Math.round(previousVolume ?? 0).toLocaleString()} kg ·{' '}
                        {before.total_reps} reps
                      </span>
                    </span>
                    <DeltaBadge value={volumeDelta} suffix=" kg" title="Volume difference" />
                    {volumePercent !== null ? (
                      <DeltaBadge value={volumePercent} suffix="%" title="Volume change" />
                    ) : null}
                  </div>
                ) : null}
              </div>

              {/* The table header. The labels are shortened on a phone so
                  the three columns still fit on a narrow screen. */}
              <div className="mb-1.5 grid grid-cols-[2.5rem_1fr_1fr_1fr] gap-2 px-1 text-[11px] uppercase tracking-wide text-ink-faint">
                <span>Set</span>
                <span className="text-right">Prev</span>
                <span className="text-right">
                  <span className="hidden sm:inline">Weight (kg)</span>
                  <span className="sm:hidden">Kg</span>
                </span>
                <span className="text-right">
                  <span className="hidden sm:inline">Reps</span>
                  <span className="sm:hidden">Reps</span>
                </span>
              </div>

              <div className="space-y-2">
                {exercise.sets.map((set) => {
                  const previousSet = before?.sets.find(
                    (item) => item.set_number === set.set_number,
                  );

                  return (
                    <div
                      key={set.clientId}
                      className="grid grid-cols-[2.5rem_1fr_1fr_1fr] items-center gap-2 rounded-xl border border-border-subtle bg-surface p-2.5"
                    >
                      <span className="text-center text-sm font-bold text-ink-faint tabular-nums">
                        {set.set_number}
                      </span>

                      {/* The previous values. */}
                      <div className="text-right">
                        {previousSet && previousSet.is_completed ? (
                          <>
                            <p className="text-sm font-semibold text-ink-muted tabular-nums">
                              {formatNumber(previousSet.weight_kg)} kg
                            </p>
                            <p className="text-xs text-ink-faint tabular-nums">
                              × {previousSet.reps}
                            </p>
                          </>
                        ) : (
                          <span className="text-xs text-ink-faint">—</span>
                        )}
                      </div>

                      {/* The new weight. */}
                      <div>
                        <label className="sr-only" htmlFor={`w-${set.clientId}`}>
                          Weight in kilograms for set {set.set_number} of {entry.name}
                        </label>
                        <input
                          id={`w-${set.clientId}`}
                          type="number"
                          inputMode="decimal"
                          step="0.5"
                          min="0"
                          value={Number.isFinite(set.weight_kg) ? set.weight_kg : 0}
                          onChange={(event) => {
                            const value = Number.parseFloat(event.target.value);
                            setDraftState((current) =>
                              current.map((item) =>
                                item.exercise_id === entry.exercise_id
                                  ? {
                                      ...item,
                                      sets: item.sets.map((row) =>
                                        row.clientId === set.clientId
                                          ? {
                                              ...row,
                                              weight_kg: Number.isFinite(value) ? value : 0,
                                              dirty: true,
                                            }
                                          : row,
                                      ),
                                    }
                                  : item,
                              ),
                            );
                          }}
                          onBlur={() =>
                            void commitSet(entry.exercise_id, set.clientId, {
                              weight_kg: set.weight_kg,
                              reps: set.reps,
                              is_completed: set.is_completed,
                            })
                          }
                          placeholder="0"
                          className="min-h-[48px] w-full rounded-lg border border-border-subtle bg-surface-raised px-2 text-center text-lg font-bold text-ink tabular-nums focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/30"
                        />
                      </div>

                      {/* The new reps. */}
                      <div>
                        <label className="sr-only" htmlFor={`r-${set.clientId}`}>
                          Repetitions for set {set.set_number} of {entry.name}
                        </label>
                        <input
                          id={`r-${set.clientId}`}
                          type="number"
                          inputMode="numeric"
                          step="1"
                          min="0"
                          value={Number.isFinite(set.reps) ? set.reps : 0}
                          onChange={(event) => {
                            const value = Number.parseInt(event.target.value, 10);
                            setDraftState((current) =>
                              current.map((item) =>
                                item.exercise_id === entry.exercise_id
                                  ? {
                                      ...item,
                                      sets: item.sets.map((row) =>
                                        row.clientId === set.clientId
                                          ? {
                                              ...row,
                                              reps: Number.isFinite(value) ? value : 0,
                                              dirty: true,
                                            }
                                          : row,
                                      ),
                                    }
                                  : item,
                              ),
                            );
                          }}
                          onBlur={() =>
                            void commitSet(entry.exercise_id, set.clientId, {
                              weight_kg: set.weight_kg,
                              reps: set.reps,
                              is_completed: set.is_completed,
                            })
                          }
                          placeholder="0"
                          className="min-h-[48px] w-full rounded-lg border border-border-subtle bg-surface-raised px-2 text-center text-lg font-bold text-ink tabular-nums focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/30"
                        />
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* The done toggle and the per-set comparison. */}
              <div className="mt-2 flex flex-wrap items-center gap-2">
                {exercise.sets.map((set) => {
                  const previousSet = before?.sets.find(
                    (item) => item.set_number === set.set_number,
                  );
                  const delta =
                    previousSet && previousSet.is_completed && isSetReady(set)
                      ? round2(set.weight_kg - previousSet.weight_kg)
                      : null;

                  return (
                    <div key={set.clientId} className="flex items-center gap-1.5">
                      <button
                        type="button"
                        onClick={() => {
                          const nextCompleted = !set.is_completed;
                          setDraftState((current) =>
                            current.map((item) =>
                              item.exercise_id === entry.exercise_id
                                ? {
                                    ...item,
                                    sets: item.sets.map((row) =>
                                      row.clientId === set.clientId
                                        ? { ...row, is_completed: nextCompleted, dirty: true }
                                        : row,
                                    ),
                                  }
                                : item,
                            ),
                          );
                          void commitSet(entry.exercise_id, set.clientId, {
                            weight_kg: set.weight_kg,
                            reps: set.reps,
                            is_completed: nextCompleted,
                          });
                        }}
                        aria-pressed={set.is_completed}
                        className={`flex h-10 w-10 items-center justify-center rounded-lg border-2 transition-colors ${
                          set.is_completed
                            ? 'border-accent bg-accent text-slate-950'
                            : 'border-border-subtle text-ink-faint hover:border-accent/50'
                        }`}
                      >
                        <CheckCircle2 className="h-5 w-5" aria-hidden="true" />
                        <span className="sr-only">
                          Mark set {set.set_number} of {entry.name} as done
                        </span>
                      </button>
                      {delta !== null && delta !== 0 ? (
                        <DeltaBadge value={delta} suffix=" kg" title="Weight difference" />
                      ) : null}
                    </div>
                  );
                })}
              </div>
            </section>
          );
        })
      )}

      {/* --- Sticky action bar ------------------------------------------ */}
      <div className="fixed inset-x-0 bottom-0 z-20 border-t border-border-subtle bg-surface/95 backdrop-blur-md">
        <div className="mx-auto flex max-w-5xl items-center gap-2 px-4 py-3 md:px-6">
          <div className="min-w-0 flex-1">
            {saveStatus === 'saving' ? (
              <p className="text-xs text-ink-muted">Saving…</p>
            ) : saveStatus === 'error' ? (
              <p className="truncate text-xs text-danger">{saveMessage ?? 'Could not save'}</p>
            ) : saveStatus === 'saved' ? (
              <p className="text-xs text-success">{saveMessage ?? 'Saved'}</p>
            ) : hasUnsavedChanges ? (
              <p className="text-xs text-warning">Unsaved changes</p>
            ) : (
              <p className="text-xs text-ink-faint">
                {totals.completionPercent.toFixed(0)}% complete
              </p>
            )}
          </div>

          <Button
            variant="secondary"
            size="sm"
            onClick={() => void saveProgress()}
          >
            <Save className="h-4 w-4" aria-hidden="true" />
            Save Progress
          </Button>
          <Button size="sm" onClick={() => setCompleteOpen(true)}>
            <CheckCircle2 className="h-4 w-4" aria-hidden="true" />
            Complete
          </Button>
        </div>
      </div>

      {/* --- Discard confirmation --------------------------------------- */}
      <Modal
        open={discardOpen}
        title="Discard draft"
        onClose={() => setDiscardOpen(false)}
        footer={
          <div className="flex gap-2">
            <Button variant="secondary" fullWidth onClick={() => setDiscardOpen(false)}>
              Keep Editing
            </Button>
            <Button variant="danger" fullWidth onClick={() => void discardDraft()}>
              Discard
            </Button>
          </div>
        }
      >
        <p className="text-sm text-ink-muted">
          This clears everything you have entered for {programme.day_name} and puts the
          previous values back. Workouts you have already saved are not affected.
        </p>
      </Modal>

      {/* --- Complete confirmation --------------------------------------- */}
      <Modal
        open={completeOpen}
        title={`Finish ${programme.day_name}`}
        onClose={() => setCompleteOpen(false)}
        footer={
          <div className="flex gap-2">
            <Button variant="secondary" fullWidth onClick={() => setCompleteOpen(false)}>
              Keep Training
            </Button>
            <Button fullWidth onClick={() => void completeWorkout()}>
              Save Workout
            </Button>
          </div>
        }
      >
        <div className="space-y-4">
          <div className="grid grid-cols-4 gap-2 text-center">
            <div className="rounded-xl bg-surface p-2.5">
              <p className="text-[11px] uppercase tracking-wide text-ink-faint">Sets</p>
              <p className="mt-0.5 text-lg font-bold text-ink tabular-nums">
                {totals.completedSets}
              </p>
            </div>
            <div className="rounded-xl bg-surface p-2.5">
              <p className="text-[11px] uppercase tracking-wide text-ink-faint">Exercises</p>
              <p className="mt-0.5 text-lg font-bold text-ink tabular-nums">
                {totals.completedExercises}
              </p>
            </div>
            <div className="rounded-xl bg-surface p-2.5">
              <p className="text-[11px] uppercase tracking-wide text-ink-faint">Reps</p>
              <p className="mt-0.5 text-lg font-bold text-ink tabular-nums">
                {totals.totalReps}
              </p>
            </div>
            <div className="rounded-xl bg-surface p-2.5">
              <p className="text-[11px] uppercase tracking-wide text-ink-faint">Volume</p>
              <p className="mt-0.5 text-lg font-bold text-accent tabular-nums">
                {Math.round(totals.totalVolume).toLocaleString()}
              </p>
            </div>
          </div>

          <div>
            <label htmlFor="day-notes" className="mb-1.5 block text-sm font-medium text-ink-muted">
              Notes (optional)
            </label>
            <textarea
              id="day-notes"
              value={notes}
              onChange={(event) => setNotes(event.target.value)}
              rows={3}
              placeholder="How did the session feel?"
              className="w-full rounded-xl border border-border-subtle bg-surface px-3.5 py-3 text-ink placeholder:text-ink-faint focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/30"
            />
          </div>

          <p className="text-xs text-ink-faint">
            This is saved as a new session. Your earlier {programme.day_name} workouts stay
            exactly as they are.
          </p>
        </div>
      </Modal>

      {/* --- Discard entry point ----------------------------------------- */}
      {hasUnsavedChanges ? (
        <div className="flex justify-center">
          <button
            type="button"
            onClick={() => setDiscardOpen(true)}
            className="inline-flex items-center gap-1.5 text-xs font-medium text-ink-faint transition-colors hover:text-danger"
          >
            <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
            Discard draft
          </button>
        </div>
      ) : null}

      {/* --- History ------------------------------------------------------ */}
      <DayHistoryModal
        open={historyOpen}
        day={day}
        dayName={programme.day_name}
        onClose={() => setHistoryOpen(false)}
      />
    </div>
  );
}
