import { Award, CalendarRange, Dumbbell, TrendingDown, TrendingUp, Trophy } from 'lucide-react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Card } from '../components/Card';
import {
  SessionRepsChart,
  SessionVolumeChart,
  SetWeightChart,
} from '../components/TrackerCharts';
import { EmptyState, ErrorState, LoadingState } from '../components/States';
import { StatCard } from '../components/StatCard';
import { ApiRequestError, api } from '../services/api';
import type {
  Exercise,
  ExerciseTracker,
  PersonalRecord,
  TrackerSession,
  WeeklyOverview,
} from '../types';
import { formatNumber, formatShortDate } from '../utils/format';

/** The date ranges the tracker can show. */
const RANGES = [
  { value: '4', label: 'Last 4 weeks' },
  { value: '8', label: 'Last 8 weeks' },
  { value: '12', label: 'Last 3 months' },
  { value: 'all', label: 'All time' },
] as const;

type RangeValue = (typeof RANGES)[number]['value'];

/** Returns the start date of the selected range, or null for all time. */
function rangeStart(value: RangeValue): string | null {
  if (value === 'all') return null;

  const weeks = value === '4' ? 4 : value === '8' ? 8 : 12;
  const date = new Date();
  date.setDate(date.getDate() - weeks * 7);

  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${date.getFullYear()}-${month}-${day}`;
}

/** A signed change with a colour and an arrow. */
function ChangeBadge({ value, unit = '' }: { value: number | null; unit?: string }) {
  if (value === null) {
    return <span className="text-xs text-ink-faint">—</span>;
  }

  const up = value > 0;
  const flat = value === 0;
  const color = flat ? 'text-ink-faint' : up ? 'text-success' : 'text-danger';
  const Icon = flat ? null : up ? TrendingUp : TrendingDown;

  return (
    <span className={`inline-flex items-center gap-1 text-sm font-semibold tabular-nums ${color}`}>
      {Icon ? <Icon className="h-3.5 w-3.5" aria-hidden="true" /> : null}
      {up ? '+' : ''}
      {formatNumber(Math.round(value * 100) / 100)}
      {unit}
    </span>
  );
}

/** The weight used by one set in a session. */
function setWeight(session: TrackerSession, setNumber: number): number | null {
  const set = session.sets.find((item) => item.set_number === setNumber);
  if (!set || !set.is_completed) return null;
  return set.weight_kg;
}

/** The reps of one set in a session. */
function setReps(session: TrackerSession, setNumber: number): number | null {
  const set = session.sets.find((item) => item.set_number === setNumber);
  if (!set || !set.is_completed) return null;
  return set.reps;
}

export function Progress() {
  const [exercises, setExercises] = useState<Exercise[]>([]);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [range, setRange] = useState<RangeValue>('8');
  const [tracker, setTracker] = useState<ExerciseTracker | null>(null);
  const [records, setRecords] = useState<PersonalRecord[]>([]);
  const [weekly, setWeekly] = useState<WeeklyOverview | null>(null);

  const [loading, setLoading] = useState(true);
  const [detailLoading, setDetailLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [detailError, setDetailError] = useState<string | null>(null);

  const load = useCallback(async (signal?: AbortSignal) => {
    setLoading(true);
    setError(null);
    try {
      const [library, recordData, weekData] = await Promise.all([
        api.listExercises({}, signal),
        api.getPersonalRecords(signal),
        api.getWeeklyOverview(signal),
      ]);
      setExercises(library);
      setRecords(recordData);
      setWeekly(weekData);

      // Default to the first exercise that actually has history.
      setSelectedId((current) => current ?? recordData[0]?.exercise_id ?? library[0]?.id ?? null);
    } catch (err) {
      if (err instanceof DOMException && err.name === 'AbortError') return;
      setError(
        err instanceof ApiRequestError ? err.displayMessage : 'Could not load your progress.',
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    void load(controller.signal);
    return () => controller.abort();
  }, [load]);

  const loadDetail = useCallback(
    async (exerciseId: number, signal?: AbortSignal) => {
      setDetailLoading(true);
      setDetailError(null);
      try {
        const from = rangeStart(range);
        const data = await api.getTracker(exerciseId, from ? { from } : {}, signal);
        setTracker(data);
      } catch (err) {
        if (err instanceof DOMException && err.name === 'AbortError') return;
        setTracker(null);
        setDetailError(
          err instanceof ApiRequestError ? err.displayMessage : 'Could not load this exercise.',
        );
      } finally {
        setDetailLoading(false);
      }
    },
    [range],
  );

  useEffect(() => {
    if (selectedId === null) return;
    const controller = new AbortController();
    void loadDetail(selectedId, controller.signal);
    return () => controller.abort();
  }, [selectedId, loadDetail]);

  // The charts are built from the sessions the API returned.
  const weightData = useMemo(
    () =>
      (tracker?.sessions ?? []).map((session) => ({
        date: formatShortDate(session.workout_date),
        set1: setWeight(session, 1),
        set2: setWeight(session, 2),
        set3: setWeight(session, 3),
      })),
    [tracker],
  );

  const volumeData = useMemo(
    () =>
      (tracker?.sessions ?? []).map((session) => ({
        date: formatShortDate(session.workout_date),
        volume: session.total_volume,
        reps: session.total_reps,
      })),
    [tracker],
  );

  // The session comparison table, newest first.
  const comparisonRows = useMemo(
    () => (tracker?.sessions ?? []).slice().reverse(),
    [tracker],
  );

  if (loading) {
    return <LoadingState label="Loading your progress…" />;
  }

  if (error) {
    return <ErrorState message={error} onRetry={() => void load()} />;
  }

  const weeklyDelta = weekly
    ? {
        workouts: weekly.current.workouts - weekly.previous.workouts,
        sets: weekly.current.completed_sets - weekly.previous.completed_sets,
        volume: weekly.current.total_volume - weekly.previous.total_volume,
      }
    : null;

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-xl font-bold text-ink">Progress Tracker</h1>
        <p className="text-sm text-ink-muted">
          Your history, personal records and weekly overview
        </p>
      </div>

      {/* --- Weekly overview --------------------------------------------- */}
      {weekly ? (
        <Card className="p-4">
          <div className="mb-3 flex items-center justify-between gap-3">
            <h2 className="flex items-center gap-2 font-bold text-ink">
              <CalendarRange className="h-4 w-4 text-accent" aria-hidden="true" />
              This week
            </h2>
            <span className="text-xs text-ink-faint">
              {formatShortDate(weekly.current.week_start)} –{' '}
              {formatShortDate(weekly.current.week_end)}
            </span>
          </div>

          <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
            <StatCard
              label="Workouts"
              value={weekly.current.workouts}
              icon={<Dumbbell className="h-4 w-4" aria-hidden="true" />}
            />
            <StatCard
              label="Exercises"
              value={weekly.current.exercises_completed}
              icon={<Award className="h-4 w-4" aria-hidden="true" />}
            />
            <StatCard
              label="Completed sets"
              value={weekly.current.completed_sets}
              icon={<TrendingUp className="h-4 w-4" aria-hidden="true" />}
            />
            <StatCard
              label="Volume"
              value={Math.round(weekly.current.total_volume).toLocaleString()}
              unit="kg"
              icon={<Trophy className="h-4 w-4" aria-hidden="true" />}
            />
          </div>

          {weeklyDelta ? (
            <div className="mt-3 flex flex-wrap gap-x-5 gap-y-1.5 text-xs text-ink-faint">
              <span>
                vs last week:{' '}
                <ChangeBadge value={weeklyDelta.workouts} unit="" /> workouts
              </span>
              <span>
                <ChangeBadge value={weeklyDelta.sets} unit="" /> sets
              </span>
              <span>
                <ChangeBadge value={weeklyDelta.volume} unit=" kg" /> volume
              </span>
            </div>
          ) : null}
        </Card>
      ) : null}

      {exercises.length === 0 ? (
        <Card>
          <EmptyState
            title="No exercises yet"
            description="Add exercises to your library and log some sets to see your progress here."
          />
        </Card>
      ) : (
        <>
          {/* --- Exercise selector and range --------------------------- */}
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <label
                htmlFor="exercise-select"
                className="mb-1.5 block text-sm font-medium text-ink-muted"
              >
                Exercise
              </label>
              <select
                id="exercise-select"
                value={selectedId ?? ''}
                onChange={(event) => setSelectedId(Number(event.target.value))}
                className="min-h-[48px] w-full rounded-xl border border-border-subtle bg-surface-raised px-3.5 text-ink focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/30"
              >
                {exercises.map((exercise) => (
                  <option key={exercise.id} value={exercise.id}>
                    {exercise.name}
                    {exercise.muscle_group ? ` — ${exercise.muscle_group}` : ''}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label
                htmlFor="range-select"
                className="mb-1.5 block text-sm font-medium text-ink-muted"
              >
                Date range
              </label>
              <select
                id="range-select"
                value={range}
                onChange={(event) => setRange(event.target.value as RangeValue)}
                className="min-h-[48px] w-full rounded-xl border border-border-subtle bg-surface-raised px-3.5 text-ink focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/30"
              >
                {RANGES.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {detailLoading ? (
            <LoadingState label="Loading exercise history…" />
          ) : detailError ? (
            <ErrorState
              message={detailError}
              onRetry={() => selectedId && void loadDetail(selectedId)}
            />
          ) : tracker ? (
            <>
              {tracker.sessions.length === 0 ? (
                <Card>
                  <EmptyState
                    title="No history for this exercise yet"
                    description="Log a set for this exercise and your progression will appear here."
                  />
                </Card>
              ) : (
                <>
                  {/* --- Latest vs previous ----------------------------- */}
                  <Card className="p-4">
                    <h2 className="mb-3 font-bold text-ink">Latest vs previous session</h2>

                    {tracker.latest && tracker.previous ? (
                      <div className="grid grid-cols-3 gap-2 text-center">
                        <div className="rounded-xl bg-surface p-3">
                          <p className="text-[11px] uppercase tracking-wide text-ink-faint">
                            Top weight
                          </p>
                          <p className="mt-1 text-lg font-bold text-ink tabular-nums">
                            {formatNumber(tracker.latest.top_weight)} kg
                          </p>
                          <ChangeBadge value={tracker.delta.weight} unit=" kg" />
                        </div>
                        <div className="rounded-xl bg-surface p-3">
                          <p className="text-[11px] uppercase tracking-wide text-ink-faint">Reps</p>
                          <p className="mt-1 text-lg font-bold text-ink tabular-nums">
                            {tracker.latest.total_reps}
                          </p>
                          <ChangeBadge value={tracker.delta.reps} unit="" />
                        </div>
                        <div className="rounded-xl bg-surface p-3">
                          <p className="text-[11px] uppercase tracking-wide text-ink-faint">
                            Volume
                          </p>
                          <p className="mt-1 text-lg font-bold text-accent tabular-nums">
                            {Math.round(tracker.latest.total_volume).toLocaleString()}
                          </p>
                          <ChangeBadge value={tracker.delta.volume} unit=" kg" />
                        </div>
                      </div>
                    ) : (
                      <p className="text-sm text-ink-muted">
                        Log one more session to see a comparison with the previous one.
                      </p>
                    )}

                    <p className="mt-3 text-xs text-ink-faint">
                      Latest: {formatShortDate(tracker.latest?.workout_date ?? '')}
                      {tracker.previous
                        ? ` · Previous: ${formatShortDate(tracker.previous.workout_date)}`
                        : ''}
                    </p>
                  </Card>

                  {/* --- Personal records ------------------------------- */}
                  <Card className="p-4">
                    <h2 className="mb-3 font-bold text-ink">Personal records</h2>
                    <div className="grid grid-cols-2 gap-3 md:grid-cols-3">
                      <StatCard
                        label="Highest weight"
                        value={
                          tracker.records.highest_weight !== null
                            ? formatNumber(tracker.records.highest_weight)
                            : '—'
                        }
                        unit="kg"
                      />
                      <StatCard
                        label="Most reps"
                        value={tracker.records.most_reps ?? '—'}
                        unit="reps"
                      />
                      <StatCard
                        label="Best volume"
                        value={
                          tracker.records.best_volume !== null
                            ? Math.round(tracker.records.best_volume).toLocaleString()
                            : '—'
                        }
                        unit="kg"
                      />
                    </div>
                    <ul className="mt-3 space-y-1 text-xs text-ink-faint">
                      <li>
                        Highest weight:{' '}
                        {tracker.records.highest_weight !== null
                          ? `${formatNumber(tracker.records.highest_weight)} kg × ${tracker.records.highest_weight_reps} reps`
                          : '—'}
                        {tracker.records.highest_weight_date
                          ? ` on ${formatShortDate(tracker.records.highest_weight_date)}`
                          : ''}
                      </li>
                      <li>
                        Most reps:{' '}
                        {tracker.records.most_reps !== null
                          ? `${tracker.records.most_reps} reps at ${formatNumber(tracker.records.most_reps_weight ?? 0)} kg`
                          : '—'}
                        {tracker.records.most_reps_date
                          ? ` on ${formatShortDate(tracker.records.most_reps_date)}`
                          : ''}
                      </li>
                      <li>
                        Best session volume:{' '}
                        {tracker.records.best_volume !== null
                          ? `${Math.round(tracker.records.best_volume).toLocaleString()} kg`
                          : '—'}
                        {tracker.records.best_volume_date
                          ? ` on ${formatShortDate(tracker.records.best_volume_date)}`
                          : ''}
                      </li>
                    </ul>
                  </Card>

                  {/* --- Session comparison table ----------------------- */}
                  <Card className="p-4">
                    <h2 className="mb-3 font-bold text-ink">Session comparison</h2>
                    <div className="-mx-4 overflow-x-auto px-4 md:mx-0 md:px-0">
                      <table className="w-full min-w-[560px] border-collapse text-sm">
                        <thead>
                          <tr className="border-b border-border-subtle text-left text-xs uppercase tracking-wide text-ink-faint">
                            <th className="py-2 pr-3 font-medium">Session</th>
                            <th className="py-2 pr-3 text-right font-medium">Set 1</th>
                            <th className="py-2 pr-3 text-right font-medium">Set 2</th>
                            <th className="py-2 pr-3 text-right font-medium">Set 3</th>
                            <th className="py-2 text-right font-medium">Total volume</th>
                          </tr>
                        </thead>
                        <tbody>
                          {comparisonRows.map((session) => (
                            <tr key={session.session_id} className="border-b border-border-subtle/60">
                              <td className="py-2.5 pr-3 font-medium text-ink">
                                {formatShortDate(session.workout_date)}
                              </td>
                              {[1, 2, 3].map((number) => {
                                const weight = setWeight(session, number);
                                const reps = setReps(session, number);
                                return (
                                  <td
                                    key={number}
                                    className="py-2.5 pr-3 text-right tabular-nums text-ink-muted"
                                  >
                                    {weight !== null && reps !== null
                                      ? `${formatNumber(weight)} kg × ${reps}`
                                      : '—'}
                                  </td>
                                );
                              })}
                              <td className="py-2.5 text-right font-semibold text-accent tabular-nums">
                                {Math.round(session.total_volume).toLocaleString()} kg
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </Card>

                  {/* --- Charts ------------------------------------------ */}
                  <Card className="p-4">
                    <h2 className="mb-3 font-bold text-ink">Weight progression</h2>
                    <SetWeightChart data={weightData} />
                  </Card>

                  <Card className="p-4">
                    <h2 className="mb-3 font-bold text-ink">Volume progression</h2>
                    <SessionVolumeChart data={volumeData} />
                  </Card>

                  <Card className="p-4">
                    <h2 className="mb-3 font-bold text-ink">Reps progression</h2>
                    <SessionRepsChart data={volumeData} />
                  </Card>
                </>
              )}
            </>
          ) : null}

          {/* --- Personal records for every exercise ------------------- */}
          {records.length > 0 ? (
            <Card className="p-4">
              <h2 className="mb-3 font-bold text-ink">All personal records</h2>
              <ul className="divide-y divide-border-subtle">
                {records.map((record) => (
                  <li
                    key={record.exercise_id}
                    className="flex items-center justify-between gap-3 py-3"
                  >
                    <div className="min-w-0">
                      <p className="truncate font-medium text-ink">{record.exercise_name}</p>
                      <p className="text-xs text-ink-faint">
                        {formatShortDate(record.achieved_on)}
                        {record.best_weight_reps !== null
                          ? ` · ${record.best_weight_reps} reps`
                          : ''}
                      </p>
                    </div>
                    <p className="shrink-0 text-sm font-semibold text-accent tabular-nums">
                      {formatNumber(record.best_weight)} kg
                    </p>
                  </li>
                ))}
              </ul>
            </Card>
          ) : null}
        </>
      )}
    </div>
  );
}
