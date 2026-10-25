import { ChevronRight, History, Minus, TrendingDown, TrendingUp } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import { Modal } from './Modal';
import { EmptyState, ErrorState, LoadingState } from './States';
import { ApiRequestError, api } from '../services/api';
import type { DaySessionSummary, SessionComparison, WorkoutSessionDetail } from '../types';
import { formatDate, formatMinutes, formatNumber, formatRelativeDate } from '../utils/format';

interface DayHistoryModalProps {
  open: boolean;
  day: number;
  dayName: string;
  onClose: () => void;
}

/**
 * The saved sessions of one day.
 *
 * The list is ordered newest first. Selecting a date shows the whole
 * session — every exercise with its three sets — and two dates can be
 * compared side by side.
 */
export function DayHistoryModal({ open, day, dayName, onClose }: DayHistoryModalProps) {
  const [sessions, setSessions] = useState<DaySessionSummary[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [detail, setDetail] = useState<WorkoutSessionDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);

  const [compareId, setCompareId] = useState<number | null>(null);
  const [comparison, setComparison] = useState<SessionComparison | null>(null);
  const [compareLoading, setCompareLoading] = useState(false);

  const load = useCallback(async (signal?: AbortSignal) => {
    setLoading(true);
    setError(null);
    try {
      const data = await api.getDaySessions(day, signal);
      setSessions(data);
      // The newest session is shown first.
      setSelectedId((current) => current ?? data[0]?.session_id ?? null);
    } catch (err) {
      if (err instanceof DOMException && err.name === 'AbortError') return;
      setError(
        err instanceof ApiRequestError ? err.displayMessage : 'Could not load the history.',
      );
    } finally {
      setLoading(false);
    }
  }, [day]);

  useEffect(() => {
    if (!open) return;
    const controller = new AbortController();
    void load(controller.signal);
    return () => controller.abort();
  }, [open, load]);

  // Load the full session when one is selected.
  useEffect(() => {
    if (!open || selectedId === null) return;
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
  }, [open, selectedId]);

  // Compare the selected session with another one.
  useEffect(() => {
    if (!open || selectedId === null || compareId === null) {
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
  }, [open, selectedId, compareId]);

  const selectedSession = sessions.find((session) => session.session_id === selectedId) ?? null;

  return (
    <Modal
      open={open}
      title={`${dayName} Workout History`}
      onClose={onClose}
      size="lg"
    >
      {loading ? (
        <LoadingState label="Loading history…" />
      ) : error ? (
        <ErrorState message={error} onRetry={() => void load()} />
      ) : sessions.length === 0 ? (
        <EmptyState
          title="No workouts yet"
          description={`No ${dayName} workout has been saved yet. Your first session will show up here.`}
        />
      ) : (
        <div className="space-y-4">
          {/* The list of saved sessions. */}
          <div>
            <p className="mb-2 text-xs font-medium uppercase tracking-wide text-ink-faint">
              {sessions.length} saved session{sessions.length === 1 ? '' : 's'}
            </p>
            <ul className="space-y-1.5">
              {sessions.map((session, index) => (
                <li key={session.session_id}>
                  <button
                    type="button"
                    onClick={() => setSelectedId(session.session_id)}
                    className={`flex w-full items-center justify-between gap-3 rounded-xl border px-3.5 py-2.5 text-left transition-colors ${
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
                        {index === 0 ? 'Latest session · ' : ''}
                        {formatRelativeDate(session.workout_date)}
                        {session.status === 'in_progress' ? ' · in progress' : ''}
                      </p>
                    </div>
                    <div className="shrink-0 text-right">
                      <p className="text-sm font-semibold text-ink tabular-nums">
                        {session.completed_sets} sets
                      </p>
                      <p className="text-xs text-accent tabular-nums">
                        {Math.round(session.total_volume).toLocaleString()} kg
                      </p>
                    </div>
                  </button>
                </li>
              ))}
            </ul>
          </div>

          {/* The full session. */}
          {selectedSession ? (
            <div className="rounded-xl border border-border-subtle bg-surface p-3.5">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="font-semibold text-ink">
                    {formatDate(selectedSession.workout_date)}
                  </p>
                  <p className="text-xs text-ink-faint">
                    {selectedSession.total_exercises} exercises ·{' '}
                    {selectedSession.completed_sets}/{selectedSession.total_sets} sets ·{' '}
                    {selectedSession.total_reps} reps ·{' '}
                    {Math.round(selectedSession.total_volume).toLocaleString()} kg ·{' '}
                    {formatMinutes(selectedSession.duration_minutes)}
                  </p>
                </div>
              </div>

              {detailLoading ? (
                <LoadingState label="Loading session…" />
              ) : detail ? (
                <div className="mt-3 space-y-2">
                  {detail.exercises.map((record) => (
                    <div
                      key={record.exercise_id}
                      className="rounded-lg border border-border-subtle bg-surface-raised p-3"
                    >
                      <div className="flex items-start justify-between gap-3">
                        <p className="min-w-0 truncate text-sm font-semibold text-ink">
                          {record.exercise_name}
                        </p>
                        <p className="shrink-0 text-xs font-semibold text-accent tabular-nums">
                          {Math.round(record.total_volume).toLocaleString()} kg
                        </p>
                      </div>
                      <ul className="mt-1.5 space-y-0.5">
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
            </div>
          ) : null}

          {/* Compare two dates. */}
          {sessions.length > 1 ? (
            <div className="rounded-xl border border-border-subtle bg-surface p-3.5">
              <p className="mb-2 flex items-center gap-1.5 text-xs font-medium uppercase tracking-wide text-ink-faint">
                <History className="h-3.5 w-3.5" aria-hidden="true" />
                Compare two sessions
              </p>

              <div className="flex items-center gap-2">
                <select
                  value={selectedId ?? ''}
                  onChange={(event) => setSelectedId(Number(event.target.value))}
                  aria-label="First session to compare"
                  className="min-h-[44px] flex-1 rounded-lg border border-border-subtle bg-surface-raised px-2 text-xs text-ink focus:border-accent focus:outline-none"
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
                  className="min-h-[44px] flex-1 rounded-lg border border-border-subtle bg-surface-raised px-2 text-xs text-ink focus:border-accent focus:outline-none"
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
                <div className="mt-3 space-y-2">
                  <div className="grid grid-cols-3 gap-2 text-center">
                    <div className="rounded-lg bg-surface-raised p-2">
                      <p className="text-[11px] uppercase tracking-wide text-ink-faint">
                        Volume
                      </p>
                      <p className="mt-0.5 text-sm font-bold text-ink tabular-nums">
                        {comparison.volume_delta > 0 ? '+' : ''}
                        {Math.round(comparison.volume_delta).toLocaleString()} kg
                      </p>
                    </div>
                    <div className="rounded-lg bg-surface-raised p-2">
                      <p className="text-[11px] uppercase tracking-wide text-ink-faint">Reps</p>
                      <p className="mt-0.5 text-sm font-bold text-ink tabular-nums">
                        {comparison.reps_delta > 0 ? '+' : ''}
                        {comparison.reps_delta}
                      </p>
                    </div>
                    <div className="rounded-lg bg-surface-raised p-2">
                      <p className="text-[11px] uppercase tracking-wide text-ink-faint">Change</p>
                      <p
                        className={`mt-0.5 inline-flex items-center gap-1 text-sm font-bold tabular-nums ${
                          comparison.direction === 'up'
                            ? 'text-success'
                            : comparison.direction === 'down'
                              ? 'text-warning'
                              : 'text-ink-faint'
                        }`}
                      >
                        {comparison.direction === 'up' ? (
                          <TrendingUp className="h-3.5 w-3.5" aria-hidden="true" />
                        ) : comparison.direction === 'down' ? (
                          <TrendingDown className="h-3.5 w-3.5" aria-hidden="true" />
                        ) : (
                          <Minus className="h-3.5 w-3.5" aria-hidden="true" />
                        )}
                        {comparison.volume_percent !== null
                          ? `${comparison.volume_percent > 0 ? '+' : ''}${Math.round(comparison.volume_percent * 10) / 10}%`
                          : '—'}
                      </p>
                    </div>
                  </div>

                  <ul className="space-y-1">
                    {comparison.exercises.map((exercise) => (
                      <li
                        key={exercise.exercise_id}
                        className="flex items-center justify-between gap-2 text-xs"
                      >
                        <span className="min-w-0 truncate text-ink-muted">
                          {exercise.exercise_name}
                        </span>
                        <span
                          className={`shrink-0 font-semibold tabular-nums ${
                            exercise.direction === 'up'
                              ? 'text-success'
                              : exercise.direction === 'down'
                                ? 'text-warning'
                                : 'text-ink-faint'
                          }`}
                        >
                          {exercise.volume_delta > 0 ? '+' : ''}
                          {Math.round(exercise.volume_delta).toLocaleString()} kg
                        </span>
                      </li>
                    ))}
                  </ul>

                  <p className="text-[11px] text-ink-faint">
                    Comparing {formatDate(comparison.session_a.workout_date)} with{' '}
                    {formatDate(comparison.session_b.workout_date)}.
                  </p>
                </div>
              ) : null}
            </div>
          ) : null}
        </div>
      )}
    </Modal>
  );
}
