import { ChevronRight, Clock, Trash2 } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import { Button } from '../components/Button';
import { Card } from '../components/Card';
import { Modal } from '../components/Modal';
import { EmptyState, ErrorState, LoadingState } from '../components/States';
import { ApiRequestError, api } from '../services/api';
import type { WorkoutSessionDetail, WorkoutSessionSummary } from '../types';
import { formatDate, formatMinutes, formatRelativeDate, formatNumber } from '../utils/format';

export function History() {
  const [workouts, setWorkouts] = useState<WorkoutSessionSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [detail, setDetail] = useState<WorkoutSessionDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState<string | null>(null);

  const [pendingDelete, setPendingDelete] = useState<WorkoutSessionSummary | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  const load = useCallback(async (signal?: AbortSignal) => {
    setLoading(true);
    setError(null);
    try {
      const data = await api.listWorkouts({ limit: 100 }, signal);
      setWorkouts(data);
    } catch (err) {
      if (err instanceof DOMException && err.name === 'AbortError') return;
      setError(
        err instanceof ApiRequestError ? err.displayMessage : 'Could not load workout history.',
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

  const openDetail = async (id: number) => {
    setDetailLoading(true);
    setDetailError(null);
    setDetail(null);
    try {
      const data = await api.getWorkout(id);
      setDetail(data);
    } catch (err) {
      setDetailError(
        err instanceof ApiRequestError ? err.displayMessage : 'Could not load this workout.',
      );
    } finally {
      setDetailLoading(false);
    }
  };

  const handleDelete = async () => {
    if (!pendingDelete) return;
    setDeleteError(null);
    try {
      await api.deleteWorkout(pendingDelete.id);
      setPendingDelete(null);
      setDetail(null);
      await load();
    } catch (err) {
      setDeleteError(
        err instanceof ApiRequestError ? err.displayMessage : 'Could not delete the workout.',
      );
    }
  };

  if (loading) {
    return <LoadingState label="Loading workout history…" />;
  }

  if (error) {
    return <ErrorState message={error} onRetry={() => void load()} />;
  }

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-bold text-ink">Workout History</h1>
        <p className="text-sm text-ink-muted">
          {workouts.length} session{workouts.length === 1 ? '' : 's'} recorded
        </p>
      </div>

      {workouts.length === 0 ? (
        <Card>
          <EmptyState
            title="No workouts yet"
            description="Completed sessions will be listed here with their sets, weights and volume."
          />
        </Card>
      ) : (
        <ul className="space-y-2.5">
          {workouts.map((workout) => (
            <li key={workout.id}>
              <button
                type="button"
                onClick={() => void openDetail(workout.id)}
                className="flex w-full items-center gap-3 rounded-2xl border border-border-subtle bg-surface-raised p-4 text-left transition-colors hover:border-accent/40"
              >
                <div className="min-w-0 flex-1">
                  <p className="font-semibold text-ink">{formatDate(workout.workout_date)}</p>
                  <p className="mt-0.5 truncate text-sm text-ink-muted">
                    {workout.exercise_names.length > 0
                      ? workout.exercise_names.join(', ')
                      : 'No exercises recorded'}
                  </p>
                  <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-ink-faint">
                    <span>
                      <span className="font-semibold text-ink-muted tabular-nums">
                        {workout.completed_sets}
                      </span>{' '}
                      / {workout.total_sets} sets
                    </span>
                    <span>
                      <span className="font-semibold text-ink-muted tabular-nums">
                        {workout.total_reps}
                      </span>{' '}
                      reps
                    </span>
                    <span>
                      <span className="font-semibold text-accent tabular-nums">
                        {Math.round(workout.total_volume).toLocaleString()}
                      </span>{' '}
                      kg volume
                    </span>
                    {workout.duration_minutes !== null ? (
                      <span className="flex items-center gap-1">
                        <Clock className="h-3 w-3" aria-hidden="true" />
                        {formatMinutes(workout.duration_minutes)}
                      </span>
                    ) : null}
                  </div>
                </div>
                <ChevronRight className="h-5 w-5 shrink-0 text-ink-faint" aria-hidden="true" />
              </button>
            </li>
          ))}
        </ul>
      )}

      <Modal
        open={detail !== null || detailLoading || detailError !== null}
        title={detail ? formatRelativeDate(detail.workout_date) : 'Workout'}
        onClose={() => {
          setDetail(null);
          setDetailError(null);
        }}
        footer={
          detail ? (
            <Button
              variant="danger"
              fullWidth
              onClick={() => {
                setPendingDelete({
                  id: detail.id,
                  workout_date: detail.workout_date,
                  exercise_names: detail.exercise_names,
                  total_sets: detail.total_sets,
                  completed_sets: detail.completed_sets,
                  total_reps: detail.total_reps,
                  total_volume: detail.total_volume,
                  start_time: detail.start_time,
                  duration_minutes: detail.duration_minutes,
                  notes: detail.notes,
                  status: detail.status,
                  title: detail.title,
                  ended_at: detail.ended_at,
                  created_at: detail.created_at,
                });
              }}
            >
              <Trash2 className="h-4 w-4" aria-hidden="true" />
              Delete Workout
            </Button>
          ) : null
        }
      >
        {detailLoading ? (
          <LoadingState label="Loading workout…" />
        ) : detailError ? (
          <ErrorState message={detailError} onRetry={() => void openDetail(0)} />
        ) : detail ? (
          <div className="space-y-4">
            <div className="grid grid-cols-4 gap-2 text-center">
              <div className="rounded-xl bg-surface p-2.5">
                <p className="text-[11px] uppercase tracking-wide text-ink-faint">Sets</p>
                <p className="mt-0.5 text-lg font-bold text-ink tabular-nums">
                  {detail.completed_sets}
                </p>
              </div>
              <div className="rounded-xl bg-surface p-2.5">
                <p className="text-[11px] uppercase tracking-wide text-ink-faint">Reps</p>
                <p className="mt-0.5 text-lg font-bold text-ink tabular-nums">
                  {detail.total_reps}
                </p>
              </div>
              <div className="rounded-xl bg-surface p-2.5">
                <p className="text-[11px] uppercase tracking-wide text-ink-faint">Volume</p>
                <p className="mt-0.5 text-lg font-bold text-accent tabular-nums">
                  {Math.round(detail.total_volume).toLocaleString()}
                </p>
              </div>
              <div className="rounded-xl bg-surface p-2.5">
                <p className="text-[11px] uppercase tracking-wide text-ink-faint">Time</p>
                <p className="mt-0.5 text-lg font-bold text-ink tabular-nums">
                  {formatMinutes(detail.duration_minutes)}
                </p>
              </div>
            </div>

            {detail.exercises.length === 0 ? (
              <p className="text-sm text-ink-muted">No sets were recorded in this workout.</p>
            ) : (
              detail.exercises.map((record) => (
                <div
                  key={record.exercise_id}
                  className="rounded-xl border border-border-subtle bg-surface p-3"
                >
                  <div className="flex items-start justify-between gap-3">
                    <p className="min-w-0 truncate font-semibold text-ink">
                      {record.exercise_name}
                    </p>
                    <p className="shrink-0 text-sm font-semibold text-accent tabular-nums">
                      {Math.round(record.total_volume).toLocaleString()} kg
                    </p>
                  </div>
                  {record.is_dumbbell ? (
                    <p className="mt-0.5 text-xs text-ink-faint">Weight per dumbbell</p>
                  ) : null}

                  <div className="mt-2 space-y-1.5">
                    {record.sets.map((set) => (
                      <div
                        key={set.id}
                        className="flex items-center justify-between gap-3 text-sm"
                      >
                        <span className="flex items-center gap-2 text-ink-muted">
                          <span className="w-12 shrink-0 text-xs font-semibold uppercase tracking-wide text-ink-faint">
                            Set {set.set_number}
                          </span>
                          <span
                            className={`h-1.5 w-1.5 shrink-0 rounded-full ${
                              set.is_completed ? 'bg-success' : 'bg-ink-faint'
                            }`}
                            aria-hidden="true"
                          />
                        </span>
                        <span className="tabular-nums text-ink">
                          {formatNumber(set.weight_kg)} kg × {set.reps}
                        </span>
                      </div>
                    ))}
                  </div>

                  <p className="mt-2 border-t border-border-subtle pt-2 text-xs text-ink-faint">
                    {record.completed_sets} of {record.sets.length} sets · {record.total_reps} reps
                  </p>
                </div>
              ))
            )}

            {detail.notes ? (
              <div>
                <p className="mb-1.5 text-sm font-medium text-ink-muted">Notes</p>
                <p className="whitespace-pre-wrap rounded-xl bg-surface p-3 text-sm text-ink">
                  {detail.notes}
                </p>
              </div>
            ) : null}
          </div>
        ) : null}
      </Modal>

      <Modal
        open={pendingDelete !== null}
        title="Delete Workout"
        onClose={() => setPendingDelete(null)}
        footer={
          <div className="flex gap-2">
            <Button variant="secondary" fullWidth onClick={() => setPendingDelete(null)}>
              Cancel
            </Button>
            <Button variant="danger" fullWidth onClick={() => void handleDelete()}>
              Delete
            </Button>
          </div>
        }
      >
        <p className="text-sm text-ink-muted">
          Delete the workout from{' '}
          <span className="font-semibold text-ink">
            {pendingDelete ? formatDate(pendingDelete.workout_date) : ''}
          </span>
          ? All of its sets will be removed too.
        </p>
        {deleteError ? (
          <p role="alert" className="mt-3 rounded-xl bg-danger/10 p-3 text-sm text-danger">
            {deleteError}
          </p>
        ) : null}
      </Modal>
    </div>
  );
}
