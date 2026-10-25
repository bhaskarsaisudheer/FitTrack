import { ArrowLeft, ChevronRight, Minus, TrendingDown, TrendingUp } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { Card } from '../components/Card';
import { EmptyState, ErrorState, LoadingState } from '../components/States';
import { ApiRequestError, api } from '../services/api';
import type {
  DayProgramme,
  DaySessionSummary,
  SessionComparison,
  WorkoutSessionDetail,
} from '../types';
import { formatDate, formatMinutes, formatNumber, formatRelativeDate } from '../utils/format';

/**
 * The full history of one day of the week.
 *
 * Every saved session is listed newest first. Picking a date shows the
 * whole session with all three sets of every exercise, and two dates can
 * be compared side by side.
 */
export function DayHistory() {
  const params = useParams<{ day: string }>();
  const day = Number(params.day ?? '1');

  const [programme, setProgramme] = useState<DayProgramme | null>(null);
  const [sessions, setSessions] = useState<DaySessionSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [detail, setDetail] = useState<WorkoutSessionDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);

  const [compareId, setCompareId] = useState<number | null>(null);
  const [comparison, setComparison] = useState<SessionComparison | null>(null);
  const [compareLoading, setCompareLoading] = useState(false);

  const load = useCallback(
    async (signal?: AbortSignal) => {
      setLoading(true);
      setError(null);
      try {
        const [programmeData, sessionsData] = await Promise.all([
          api.getDayProgramme(day, signal),
          api.getDaySessions(day, signal),
        ]);
        setProgramme(programmeData);
        setSessions(sessionsData);
        setSelectedId((current) => current ?? sessionsData[0]?.session_id ?? null);
      } catch (err) {
        if (err instanceof DOMException && err.name === 'AbortError') return;
        setError(
          err instanceof ApiRequestError
            ? err.displayMessage
            : 'Could not load the history.',
        );
      } finally {
        setLoading(false);
      }
    },
    [day],
  );

  useEffect(() => {
    const controller = new AbortController();
    void load(controller.signal);
    return () => controller.abort();
  }, [load]);

  // Load the full session when one is selected.
  useEffect(() => {
    if (selectedId === null) {
      setDetail(null);
      return;
    }
    let cancelled = false;

    const loadDetail = async () => {
      setDetailLoading(true);
      try {
        const data = await api.getWorkout(selectedId);
        if (!cancelled) setDetail(data);
      } catch {
        if (!cancelled) setDetail(null);
      } finally {
        if (!cancelled) setDetailLoading(false);
      }
    };

    void loadDetail();
    return () => {
      cancelled = true;
    };
  }, [selectedId]);

  // Compare the selected session with another one.
  useEffect(() => {
    if (selectedId === null || compareId === null) {
      setComparison(null);
      return;
    }
    let cancelled = false;

    const loadComparison = async () => {
      setCompareLoading(true);
      try {
        const data = await api.compareSessions(selectedId, compareId);
        if (!cancelled) setComparison(data);
      } catch {
        if (!cancelled) setComparison(null);
      } finally {
        if (!cancelled) setCompareLoading(false);
      }
    };

    void loadComparison();
    return () => {
      cancelled = true;
    };
  }, [selectedId, compareId]);

  const selectedSession = sessions.find((session) => session.session_id === selectedId) ?? null;

  if (loading) {
    return <LoadingState label="Loading history…" />;
  }

  if (error) {
    return <ErrorState message={error} onRetry={() => void load()} />;
  }

  return (
    <div className="space-y-4">
      <div>
        <Link
          to={`/workout/day/${day}`}
          className="inline-flex items-center gap-1.5 text-sm font-medium text-ink-muted transition-colors hover:text-ink"
        >
          <ArrowLeft className="h-4 w-4" aria-hidden="true" />
          {programme?.day_name ?? 'Workout'}
        </Link>
        <h1 className="mt-2 text-xl font-bold text-ink">
          {programme?.day_name ?? 'Day'} History
        </h1>
        <p className="mt-0.5 text-sm text-ink-muted">
          {programme?.title} · {sessions.length} saved session{sessions.length === 1 ? '' : 's'}
        </p>
      </div>

      {sessions.length === 0 ? (
        <Card>
          <EmptyState
            title="No workouts yet"
            description={`Nothing has been saved for ${programme?.day_name ?? 'this day'} yet.`}
            action={
              <Link
                to={`/workout/day/${day}`}
                className="inline-flex min-h-[44px] items-center rounded-xl bg-accent px-4 text-sm font-semibold text-slate-950"
              >
                Start the workout
              </Link>
            }
          />
        </Card>
      ) : (
        <>
          {/* The list of dates. */}
          <Card className="p-3">
            <p className="mb-2 px-1 text-xs font-medium uppercase tracking-wide text-ink-faint">
              All sessions
            </p>
            <ul className="space-y-1.5">
              {sessions.map((session, index) => (
                <li key={session.session_id}>
                  <button
                    type="button"
                    onClick={() => setSelectedId(session.session_id)}
                    className={`flex w-full items-center justify-between gap-3 rounded-xl border px-3.5 py-3 text-left transition-colors ${
                      session.session_id === selectedId
                        ? 'border-accent bg-accent/10'
                        : 'border-border-subtle bg-surface hover:border-accent/40'
                    }`}
                  >
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-ink">
                        {formatDate(session.workout_date)}
                      </p>
                      <p className="text-xs text-ink-faint">
                        {index === 0 ? 'Latest · ' : ''}
                        {formatRelativeDate(session.workout_date)}
                        {session.status === 'in_progress' ? ' · in progress' : ''}
                      </p>
                    </div>
                    <div className="flex shrink-0 items-center gap-3">
                      <div className="text-right">
                        <p className="text-sm font-semibold text-ink tabular-nums">
                          {session.completed_sets} sets
                        </p>
                        <p className="text-xs text-accent tabular-nums">
                          {Math.round(session.total_volume).toLocaleString()} kg
                        </p>
                      </div>
                      <ChevronRight className="h-4 w-4 text-ink-faint" aria-hidden="true" />
                    </div>
                  </button>
                </li>
              ))}
            </ul>
          </Card>

          {/* The selected session in full. */}
          {selectedSession ? (
            <Card className="p-4">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <h2 className="font-bold text-ink">{formatDate(selectedSession.workout_date)}</h2>
                <p className="text-xs text-ink-faint">
                  {selectedSession.total_exercises} exercises ·{' '}
                  {selectedSession.completed_sets}/{selectedSession.total_sets} sets ·{' '}
                  {selectedSession.total_reps} reps ·{' '}
                  {Math.round(selectedSession.total_volume).toLocaleString()} kg ·{' '}
                  {formatMinutes(selectedSession.duration_minutes)}
                </p>
              </div>

              {detailLoading ? (
                <LoadingState label="Loading session…" />
              ) : detail ? (
                <div className="mt-3 space-y-2">
                  {detail.exercises.map((record) => (
                    <div
                      key={record.exercise_id}
                      className="rounded-xl border border-border-subtle bg-surface p-3"
                    >
                      <div className="flex items-start justify-between gap-3">
                        <p className="min-w-0 truncate text-sm font-semibold text-ink">
                          {record.exercise_name}
                        </p>
                        <p className="shrink-0 text-xs font-semibold text-accent tabular-nums">
                          {Math.round(record.total_volume).toLocaleString()} kg
                        </p>
                      </div>
                      <ul className="mt-2 space-y-1">
                        {record.sets.map((set) => (
                          <li
                            key={set.id}
                            className="flex items-center justify-between gap-2 text-xs"
                          >
                            <span className="flex items-center gap-1.5 text-ink-faint">
                              <span
                                className={`h-1.5 w-1.5 rounded-full ${
                                  set.is_completed ? 'bg-success' : 'bg-ink-faint'
                                }`}
                                aria-hidden="true"
                              />
                              Set {set.set_number}
                            </span>
                            <span className="tabular-nums text-ink-muted">
                              {formatNumber(set.weight_kg)} kg × {set.reps}
                            </span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  ))}
                </div>
              ) : null}
            </Card>
          ) : null}

          {/* Compare two dates. */}
          {sessions.length > 1 ? (
            <Card className="p-4">
              <h2 className="mb-3 text-sm font-bold text-ink">Compare two dates</h2>

              <div className="flex items-center gap-2">
                <select
                  value={selectedId ?? ''}
                  onChange={(event) => setSelectedId(Number(event.target.value))}
                  aria-label="First session to compare"
                  className="min-h-[48px] flex-1 rounded-lg border border-border-subtle bg-surface px-2 text-sm text-ink focus:border-accent focus:outline-none"
                >
                  {sessions.map((session) => (
                    <option key={session.session_id} value={session.session_id}>
                      {formatDate(session.workout_date)}
                    </option>
                  ))}
                </select>

                <ChevronRight className="h-4 w-4 shrink-0 text-ink-faint" aria-hidden="true" />

                <select
                  value={compareId ?? ''}
                  onChange={(event) =>
                    setCompareId(event.target.value ? Number(event.target.value) : null)
                  }
                  aria-label="Second session to compare"
                  className="min-h-[48px] flex-1 rounded-lg border border-border-subtle bg-surface px-2 text-sm text-ink focus:border-accent focus:outline-none"
                >
                  <option value="">Pick a date…</option>
                  {sessions
                    .filter((session) => session.session_id !== selectedId)
                    .map((session) => (
                      <option key={session.session_id} value={session.session_id}>
                        {formatDate(session.workout_date)}
                      </option>
                    ))}
                </select>
              </div>

              {compareLoading ? (
                <LoadingState label="Comparing…" />
              ) : comparison ? (
                <div className="mt-3 space-y-3">
                  <div className="grid grid-cols-3 gap-2 text-center">
                    <div className="rounded-lg bg-surface p-2.5">
                      <p className="text-[11px] uppercase tracking-wide text-ink-faint">Volume</p>
                      <p className="mt-0.5 text-base font-bold text-ink tabular-nums">
                        {comparison.volume_delta > 0 ? '+' : ''}
                        {Math.round(comparison.volume_delta).toLocaleString()} kg
                      </p>
                    </div>
                    <div className="rounded-lg bg-surface p-2.5">
                      <p className="text-[11px] uppercase tracking-wide text-ink-faint">Reps</p>
                      <p className="mt-0.5 text-base font-bold text-ink tabular-nums">
                        {comparison.reps_delta > 0 ? '+' : ''}
                        {comparison.reps_delta}
                      </p>
                    </div>
                    <div className="rounded-lg bg-surface p-2.5">
                      <p className="text-[11px] uppercase tracking-wide text-ink-faint">Change</p>
                      <p
                        className={`mt-0.5 inline-flex items-center gap-1 text-base font-bold tabular-nums ${
                          comparison.direction === 'up'
                            ? 'text-success'
                            : comparison.direction === 'down'
                              ? 'text-warning'
                              : 'text-ink-faint'
                        }`}
                      >
                        {comparison.direction === 'up' ? (
                          <TrendingUp className="h-4 w-4" aria-hidden="true" />
                        ) : comparison.direction === 'down' ? (
                          <TrendingDown className="h-4 w-4" aria-hidden="true" />
                        ) : (
                          <Minus className="h-4 w-4" aria-hidden="true" />
                        )}
                        {comparison.volume_percent !== null
                          ? `${comparison.volume_percent > 0 ? '+' : ''}${Math.round(comparison.volume_percent * 10) / 10}%`
                          : '—'}
                      </p>
                    </div>
                  </div>

                  {/* The side-by-side table. */}
                  <div className="overflow-x-auto rounded-xl border border-border-subtle">
                    <table className="w-full min-w-[420px] text-left text-xs">
                      <thead className="bg-surface text-ink-faint">
                        <tr>
                          <th className="px-3 py-2 font-medium">Exercise</th>
                          <th className="px-3 py-2 text-right font-medium">
                            {formatDate(comparison.session_a.workout_date)}
                          </th>
                          <th className="px-3 py-2 text-right font-medium">
                            {formatDate(comparison.session_b.workout_date)}
                          </th>
                          <th className="px-3 py-2 text-right font-medium">Change</th>
                        </tr>
                      </thead>
                      <tbody>
                        {comparison.exercises.map((exercise) => (
                          <tr key={exercise.exercise_id} className="border-t border-border-subtle">
                            <td className="px-3 py-2 text-ink-muted">{exercise.exercise_name}</td>
                            <td className="px-3 py-2 text-right tabular-nums text-ink-faint">
                              {Math.round(exercise.previous_volume).toLocaleString()}
                            </td>
                            <td className="px-3 py-2 text-right tabular-nums text-ink">
                              {Math.round(exercise.current_volume).toLocaleString()}
                            </td>
                            <td
                              className={`px-3 py-2 text-right font-semibold tabular-nums ${
                                exercise.direction === 'up'
                                  ? 'text-success'
                                  : exercise.direction === 'down'
                                    ? 'text-warning'
                                    : 'text-ink-faint'
                              }`}
                            >
                              {exercise.volume_delta > 0 ? '+' : ''}
                              {Math.round(exercise.volume_delta).toLocaleString()}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              ) : null}
            </Card>
          ) : null}
        </>
      )}
    </div>
  );
}
