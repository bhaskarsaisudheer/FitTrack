import {
  Activity,
  CalendarDays,
  ChevronRight,
  Dumbbell,
  Flame,
  LineChart,
  Moon,
  Trophy,
  TrendingUp,
} from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Button } from '../components/Button';
import { Card } from '../components/Card';
import { EmptyState, ErrorState, LoadingState } from '../components/States';
import { StatCard } from '../components/StatCard';
import { ApiRequestError, api } from '../services/api';
import type {
  ProgressSummary,
  ScheduleEntry,
  WeekDay,
  WorkoutSessionSummary,
} from '../types';
import { formatRelativeDate, formatShortDate, formatVolume, todayIso } from '../utils/format';

/** The weekday index used by the schedule: 1 = Monday … 7 = Sunday. */
function todayDayIndex(): number {
  const day = new Date().getDay();
  return day === 0 ? 7 : day;
}

export function Dashboard() {
  const navigate = useNavigate();
  const [summary, setSummary] = useState<ProgressSummary | null>(null);
  const [workouts, setWorkouts] = useState<WorkoutSessionSummary[]>([]);
  const [todaySchedule, setTodaySchedule] = useState<ScheduleEntry[]>([]);
  const [week, setWeek] = useState<WeekDay[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async (signal?: AbortSignal) => {
    setLoading(true);
    setError(null);
    try {
      const [summaryData, workoutData, scheduleData, weekData] = await Promise.all([
        api.getProgressSummary(signal),
        api.listWorkouts({ limit: 5 }, signal),
        api.getDaySchedule(todayDayIndex(), signal),
        api.getWeekProgramme(signal),
      ]);
      setSummary(summaryData);
      setWorkouts(workoutData);
      setTodaySchedule(scheduleData);
      setWeek(weekData);
    } catch (err) {
      if (err instanceof DOMException && err.name === 'AbortError') return;
      setError(
        err instanceof ApiRequestError ? err.displayMessage : 'Could not load the dashboard.',
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

  const today = todayIso();
  const todayWorkout = workouts.find((workout) => workout.workout_date === today);
  const lastWorkout = workouts[0];
  const isRestDay = todayDayIndex() === 7;

  if (loading) {
    return <LoadingState label="Loading your dashboard…" />;
  }

  if (error) {
    return <ErrorState message={error} onRetry={() => void load()} />;
  }

  return (
    <div className="space-y-5">
      <div>
        <p className="text-sm font-medium text-ink-muted">
          {new Date().toLocaleDateString(undefined, {
            weekday: 'long',
            day: 'numeric',
            month: 'long',
          })}
        </p>
        <h1 className="mt-0.5 text-2xl font-bold text-ink">
          {isRestDay ? 'Rest day' : 'Ready to train?'}
        </h1>
      </div>

      {isRestDay ? (
        <Card className="p-4">
          <div className="flex items-center gap-3">
            <span className="rounded-xl bg-surface-hover p-2.5">
              <Moon className="h-5 w-5 text-ink-muted" aria-hidden="true" />
            </span>
            <div>
              <p className="font-semibold text-ink">Sunday is your rest day</p>
              <p className="text-sm text-ink-muted">
                Recover well — Monday&apos;s session is waiting for you.
              </p>
            </div>
          </div>
        </Card>
      ) : null}

      <Button size="lg" fullWidth onClick={() => navigate('/workout')}>
        <Dumbbell className="h-5 w-5" aria-hidden="true" />
        Start Workout
      </Button>

      {/* --- The week -----------------------------------------------
          Every day is a link to its own workout. */}
      {week.length > 0 ? (
        <section>
          <div className="mb-3 flex items-center justify-between gap-3">
            <h2 className="text-base font-bold text-ink">Your week</h2>
            <span className="text-xs text-ink-faint">Tap a day to train</span>
          </div>

          <ul className="grid grid-cols-2 gap-2.5 sm:grid-cols-4 md:grid-cols-7">
            {week.map((day) => {
              const isToday = day.day_of_week === todayDayIndex();

              return (
                <li key={day.day_of_week}>
                  <Link
                    to={
                      day.is_rest_day
                        ? `/history/day/${day.day_of_week}`
                        : `/workout/day/${day.day_of_week}`
                    }
                    aria-label={`${day.day_name} — ${day.title}`}
                    className={`group flex h-full min-h-[112px] flex-col rounded-2xl border p-3 transition-colors ${
                      isToday
                        ? 'border-accent bg-accent/10'
                        : 'border-border-subtle bg-surface-raised hover:border-accent/40'
                    }`}
                  >
                    <div className="flex items-start justify-between gap-1">
                      <span
                        className={`text-xs font-bold uppercase tracking-wide ${
                          isToday ? 'text-accent' : 'text-ink-muted'
                        }`}
                      >
                        {day.short_name}
                      </span>
                      {isToday ? (
                        <span className="rounded-full bg-accent px-1.5 py-0.5 text-[10px] font-bold text-slate-950">
                          Today
                        </span>
                      ) : (
                        <ChevronRight
                          className="h-3.5 w-3.5 text-ink-faint transition-colors group-hover:text-accent"
                          aria-hidden="true"
                        />
                      )}
                    </div>

                    <p className="mt-1.5 min-w-0 flex-1 text-sm font-bold leading-tight text-ink">
                      {day.title}
                    </p>

                    <p className="mt-1 text-[11px] text-ink-faint">
                      {day.is_rest_day
                        ? 'Rest day'
                        : `${day.exercise_count} exercise${day.exercise_count === 1 ? '' : 's'}${
                            day.estimated_minutes ? ` · ${day.estimated_minutes} min` : ''
                          }`}
                    </p>
                  </Link>
                </li>
              );
            })}
          </ul>
        </section>
      ) : null}

      {/* --- Today's programme ------------------------------------------ */}
      {todaySchedule.length > 0 ? (
        <Card className="p-4">
          <div className="mb-3 flex items-center justify-between gap-3">
            <h2 className="text-xs font-medium uppercase tracking-wide text-accent">
              Today&apos;s programme
            </h2>
            <span className="text-xs text-ink-faint">
              {todaySchedule.length} exercise{todaySchedule.length === 1 ? '' : 's'}
            </span>
          </div>
          <ul className="space-y-1.5">
            {todaySchedule.map((entry) => (
              <li key={entry.exercise_id} className="flex items-center justify-between gap-3">
                <span className="min-w-0 truncate text-sm font-medium text-ink">
                  {entry.name}
                </span>
                <span className="shrink-0 text-xs text-ink-faint">
                  {entry.default_sets} sets
                </span>
              </li>
            ))}
          </ul>
        </Card>
      ) : null}

      {todayWorkout ? (
        <Card className="p-4">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-xs font-medium uppercase tracking-wide text-accent">
                Today&apos;s session
              </p>
              <p className="mt-1 font-semibold text-ink">
                {todayWorkout.exercise_names.length} exercise
                {todayWorkout.exercise_names.length === 1 ? '' : 's'} ·{' '}
                {todayWorkout.completed_sets} sets
              </p>
            </div>
            <Button variant="secondary" size="sm" onClick={() => navigate('/workout')}>
              Continue
            </Button>
          </div>
        </Card>
      ) : null}

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <StatCard
          label="This week"
          value={summary?.workouts_this_week ?? 0}
          unit="workouts"
          icon={<CalendarDays className="h-4 w-4" aria-hidden="true" />}
        />
        <StatCard
          label="Total sessions"
          value={summary?.total_sessions ?? 0}
          icon={<Activity className="h-4 w-4" aria-hidden="true" />}
        />
        <StatCard
          label="Completed sets"
          value={summary?.completed_sets ?? 0}
          icon={<Flame className="h-4 w-4" aria-hidden="true" />}
        />
        <StatCard
          label="Total volume"
          value={formatVolume(summary?.total_volume ?? 0)}
          icon={<TrendingUp className="h-4 w-4" aria-hidden="true" />}
        />
      </div>

      {lastWorkout ? (
        <Card className="p-4">
          <div className="flex items-center gap-2 text-ink-faint">
            <Trophy className="h-4 w-4" aria-hidden="true" />
            <span className="text-xs font-medium uppercase tracking-wide">Last workout</span>
          </div>
          <p className="mt-2 font-semibold text-ink">
            {formatRelativeDate(lastWorkout.workout_date)}
          </p>
          <p className="mt-1 text-sm text-ink-muted">
            {lastWorkout.exercise_names.length > 0
              ? lastWorkout.exercise_names.join(', ')
              : 'No exercises recorded'}
          </p>
          <div className="mt-3 flex gap-4 text-sm">
            <span className="text-ink-muted">
              <span className="font-semibold text-ink tabular-nums">
                {lastWorkout.completed_sets}
              </span>{' '}
              sets
            </span>
            <span className="text-ink-muted">
              <span className="font-semibold text-accent tabular-nums">
                {Math.round(lastWorkout.total_volume).toLocaleString()}
              </span>{' '}
              kg volume
            </span>
          </div>
        </Card>
      ) : null}

      <section>
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-base font-bold text-ink">Recent Workouts</h2>
          <Link to="/history" className="text-sm font-medium text-accent hover:underline">
            View all
          </Link>
        </div>

        {workouts.length === 0 ? (
          <Card>
            <EmptyState
              title="No workouts yet"
              description="Your completed sessions will appear here once you log your first workout."
            />
          </Card>
        ) : (
          <ul className="space-y-2.5">
            {workouts.map((workout) => (
              <li key={workout.id}>
                <Link
                  to="/history"
                  className="flex items-center justify-between gap-3 rounded-2xl border border-border-subtle bg-surface-raised p-4 transition-colors hover:border-accent/40"
                >
                  <div className="min-w-0">
                    <p className="font-semibold text-ink">
                      {formatShortDate(workout.workout_date)}
                    </p>
                    <p className="mt-0.5 truncate text-sm text-ink-muted">
                      {workout.exercise_names.length > 0
                        ? workout.exercise_names.join(', ')
                        : 'No exercises recorded'}
                    </p>
                  </div>
                  <div className="shrink-0 text-right">
                    <p className="text-sm font-semibold text-ink tabular-nums">
                      {workout.completed_sets} sets
                    </p>
                    <p className="text-xs text-ink-faint tabular-nums">
                      {Math.round(workout.total_volume).toLocaleString()} kg
                    </p>
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>

      <Link
        to="/progress"
        className="flex items-center justify-between gap-3 rounded-2xl border border-border-subtle bg-surface-raised p-4 transition-colors hover:border-accent/40"
      >
        <div className="flex items-center gap-3">
          <span className="rounded-xl bg-accent/10 p-2.5">
            <LineChart className="h-5 w-5 text-accent" aria-hidden="true" />
          </span>
          <div>
            <p className="font-semibold text-ink">Progress Tracker</p>
            <p className="text-sm text-ink-muted">
              {summary?.personal_records.length ?? 0} exercises tracked
            </p>
          </div>
        </div>
        <span className="text-ink-faint">›</span>
      </Link>
    </div>
  );
}
