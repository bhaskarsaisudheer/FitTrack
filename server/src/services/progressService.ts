import type { RowDataPacket } from 'mysql2';
import { pool } from '../config/database.js';
import { queryOne, queryRows } from '../config/query.js';
import { ApiError } from '../middleware/errors.js';
import type { ExerciseProgress, ProgressSummary } from '../types/index.js';
import { getAllPersonalRecords, getWeeklyOverview } from './trackerService.js';
import { round2 } from '../utils/volume.js';

/**
 * Returns the full history for one exercise: every session it appeared in,
 * every set, personal best weight and the accumulated training volume.
 */
export async function getExerciseProgress(exerciseId: number): Promise<ExerciseProgress> {
  const exercise = await queryOne<
    RowDataPacket & { id: number; name: string; muscle_group: string | null; is_dumbbell: number }
  >(pool, 'SELECT id, name, muscle_group, is_dumbbell FROM exercises WHERE id = ?', [exerciseId]);

  if (!exercise) throw ApiError.notFound('Exercise not found.');

  const isDumbbell = Boolean(exercise.is_dumbbell);

  // Every set for this exercise, oldest first, with the session date attached.
  const setRows = await queryRows<
    RowDataPacket & {
      id: number;
      session_id: number;
      set_number: number;
      weight_kg: number;
      reps: number;
      is_completed: number;
      workout_date: string;
    }
  >(
    pool,
    `SELECT ws.id, ws.session_id, ws.set_number, ws.weight_kg, ws.reps, ws.is_completed,
            s.workout_date
     FROM workout_sets ws
     JOIN workout_sessions s ON s.id = ws.session_id
     WHERE ws.exercise_id = ?
     ORDER BY s.workout_date ASC, ws.session_id ASC, ws.set_number ASC`,
    [exerciseId],
  );

  const sets = setRows.map((row) => ({
    ...row,
    weight_kg: Number(row.weight_kg),
    is_completed: Boolean(row.is_completed),
  }));

  // Group the sets into one entry per session.
  const bySession = new Map<
    number,
    { session_id: number; workout_date: string; sets: typeof sets }
  >();

  for (const set of sets) {
    const entry = bySession.get(set.session_id);
    if (entry) {
      entry.sets.push(set);
    } else {
      bySession.set(set.session_id, {
        session_id: set.session_id,
        workout_date: set.workout_date,
        sets: [set],
      });
    }
  }

  const history = [...bySession.values()]
    .sort((a, b) => a.workout_date.localeCompare(b.workout_date))
    .map((entry) => {
      const completed = entry.sets.filter((set) => set.is_completed);
      const topWeight = completed.length ? Math.max(...completed.map((set) => set.weight_kg)) : 0;
      const bestSet = completed.reduce<(typeof completed)[number] | null>((best, set) => {
        if (!best) return set;
        // Heavier wins; on a tie, more reps wins.
        if (set.weight_kg > best.weight_kg) return set;
        if (set.weight_kg === best.weight_kg && set.reps > best.reps) return set;
        return best;
      }, null);

      return {
        session_id: entry.session_id,
        workout_date: entry.workout_date,
        top_weight: topWeight,
        total_reps: completed.reduce((sum, set) => sum + set.reps, 0),
        total_volume: round2(
          completed.reduce(
            (sum, set) => sum + set.weight_kg * set.reps * (isDumbbell ? 2 : 1),
            0,
          ),
        ),
        best_set: bestSet
          ? { weight_kg: bestSet.weight_kg, reps: bestSet.reps, set_number: bestSet.set_number }
          : null,
        sets: entry.sets.map((set) => ({
          set_number: set.set_number,
          weight_kg: set.weight_kg,
          reps: set.reps,
          is_completed: set.is_completed,
        })),
      };
    });

  const completedSets = sets.filter((set) => set.is_completed);

  const personalBest = completedSets.reduce<(typeof completedSets)[number] | null>(
    (best, set) => {
      if (!best) return set;
      if (set.weight_kg > best.weight_kg) return set;
      if (set.weight_kg === best.weight_kg && set.reps > best.reps) return set;
      return best;
    },
    null,
  );

  // The personal best date should match the session the best set came from.
  const personalBestDate = personalBest
    ? (bySession.get(personalBest.session_id)?.workout_date ?? null)
    : null;

  return {
    exercise_id: exercise.id,
    exercise_name: exercise.name,
    muscle_group: exercise.muscle_group,
    personal_best_weight: personalBest ? personalBest.weight_kg : null,
    personal_best_date: personalBestDate,
    total_volume: round2(
      completedSets.reduce(
        (sum, set) => sum + set.weight_kg * set.reps * (isDumbbell ? 2 : 1),
        0,
      ),
    ),
    total_completed_sets: completedSets.length,
    history,
    completed_sets: completedSets.map((set) => ({
      workout_date: set.workout_date,
      session_id: set.session_id,
      set_number: set.set_number,
      weight_kg: set.weight_kg,
      reps: set.reps,
      volume: round2(set.weight_kg * set.reps * (isDumbbell ? 2 : 1)),
    })),
  };
}

/** Returns the overall statistics shown on the dashboard and progress screen. */
export async function getProgressSummary(): Promise<ProgressSummary> {
  const summary = await queryOne<
    RowDataPacket & {
      total_sessions: number;
      total_exercises: number;
      total_sets: number;
      completed_sets: number;
      total_volume: number;
    }
  >(
    pool,
    `SELECT
       (SELECT COUNT(*) FROM workout_sessions) AS total_sessions,
       (SELECT COUNT(*) FROM exercises) AS total_exercises,
       (SELECT COUNT(*) FROM workout_sets) AS total_sets,
       (SELECT COUNT(*) FROM workout_sets WHERE is_completed = TRUE) AS completed_sets,
       (SELECT COALESCE(SUM(ws.weight_kg * ws.reps * IF(e.is_dumbbell = TRUE, 2, 1)), 0)
          FROM workout_sets ws
          JOIN exercises e ON e.id = ws.exercise_id
         WHERE ws.is_completed = TRUE) AS total_volume`,
  );

  // Workouts in the trailing seven days, inclusive of today.
  const week = await queryOne<RowDataPacket & { count: number }>(
    pool,
    `SELECT COUNT(*) AS count
     FROM workout_sessions
     WHERE workout_date >= DATE_SUB(CURDATE(), INTERVAL 6 DAY)
       AND workout_date <= CURDATE()`,
  );

  const personalRecords = await getAllPersonalRecords();

  const volumeByDate = await queryRows<
    RowDataPacket & { workout_date: string; volume: number; sessions: number }
  >(
    pool,
    `SELECT s.workout_date,
            COALESCE(SUM(CASE WHEN ws.is_completed
                              THEN ws.weight_kg * ws.reps * IF(e.is_dumbbell = TRUE, 2, 1)
                              ELSE 0 END), 0) AS volume,
            COUNT(DISTINCT s.id) AS sessions
     FROM workout_sessions s
     LEFT JOIN workout_sets ws ON ws.session_id = s.id
     LEFT JOIN exercises e ON e.id = ws.exercise_id
     GROUP BY s.workout_date
     ORDER BY s.workout_date ASC`,
  );

  const weekly = await getWeeklyOverview();

  return {
    total_sessions: Number(summary?.total_sessions ?? 0),
    total_exercises: Number(summary?.total_exercises ?? 0),
    total_sets: Number(summary?.total_sets ?? 0),
    completed_sets: Number(summary?.completed_sets ?? 0),
    total_volume: round2(Number(summary?.total_volume ?? 0)),
    workouts_this_week: Number(week?.count ?? 0),
    personal_records: personalRecords,
    volume_by_date: volumeByDate.map((row) => ({
      workout_date: row.workout_date,
      volume: round2(Number(row.volume)),
      sessions: Number(row.sessions),
    })),
    weekly,
  };
}

/**
 * Returns the most recent session for an exercise, so the logging screen can
 * show "last time" values next to the current inputs.
 */
export async function getPreviousPerformance(
  exerciseId: number,
  beforeDate?: string,
): Promise<
  | {
      session_id: number;
      workout_date: string;
      sets: Array<{ set_number: number; weight_kg: number; reps: number }>;
    }
  | null
> {
  const params: (string | number)[] = [exerciseId];
  let dateClause = '';
  if (beforeDate) {
    dateClause = 'AND s.workout_date < ?';
    params.push(beforeDate);
  }

  const session = await queryOne<RowDataPacket & { session_id: number; workout_date: string }>(
    pool,
    `SELECT s.id AS session_id, s.workout_date
     FROM workout_sessions s
     JOIN workout_sets ws ON ws.session_id = s.id
     WHERE ws.exercise_id = ? ${dateClause}
     ORDER BY s.workout_date DESC, s.id DESC
     LIMIT 1`,
    params,
  );

  if (!session) return null;

  const sets = await queryRows<
    RowDataPacket & { set_number: number; weight_kg: number; reps: number }
  >(
    pool,
    `SELECT set_number, weight_kg, reps
     FROM workout_sets
     WHERE session_id = ? AND exercise_id = ?
     ORDER BY set_number ASC`,
    [session.session_id, exerciseId],
  );

  return {
    session_id: session.session_id,
    workout_date: session.workout_date,
    sets: sets.map((set) => ({ ...set, weight_kg: Number(set.weight_kg) })),
  };
}
