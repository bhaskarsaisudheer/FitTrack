import type { RowDataPacket } from 'mysql2';
import { pool } from '../config/database.js';
import { execute, queryOne, queryRows } from '../config/query.js';
import { ApiError } from '../middleware/errors.js';
import type {
  WorkoutExerciseRecord,
  WorkoutSession,
  WorkoutSessionDetail,
  WorkoutSetWithExercise,
} from '../types/index.js';
import { dayOfWeekForDate } from './scheduleService.js';
import { round2, totalsForSets } from '../utils/volume.js';

type SessionRow = RowDataPacket & WorkoutSession;
type SetWithExerciseRow = RowDataPacket & WorkoutSetWithExercise;

export interface SessionListItem extends WorkoutSession {
  exercise_names: string[];
  total_sets: number;
  completed_sets: number;
  total_reps: number;
  total_volume: number;
}

type SessionListRow = RowDataPacket & SessionListItem;

interface ListOptions {
  limit: number;
  offset: number;
  from?: string;
  to?: string;
}

/** The columns of a session row, kept in one place. */
const SESSION_COLUMNS = `id, workout_date, day_of_week, start_time, duration_minutes, notes,
       status, title, ended_at, created_at`;

/**
 * Lists sessions newest-first. The aggregate subquery keeps this to a single
 * round trip, which matters on a phone connection.
 */
export async function listWorkouts(options: ListOptions): Promise<SessionListItem[]> {
  const conditions: string[] = [];
  const params: (string | number)[] = [];

  if (options.from) {
    conditions.push('s.workout_date >= ?');
    params.push(options.from);
  }
  if (options.to) {
    conditions.push('s.workout_date <= ?');
    params.push(options.to);
  }

  const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

  // The exercise names are aggregated with JSON_ARRAYAGG over a
  // pre-deduplicated sub-query, because MySQL does not support DISTINCT
  // inside JSON_ARRAYAGG.
  const sql = `
    SELECT
      s.id,
      s.workout_date,
      s.day_of_week,
      s.start_time,
      s.duration_minutes,
      s.notes,
      s.status,
      s.title,
      s.ended_at,
      s.created_at,
      COALESCE(names_agg.exercise_names, JSON_ARRAY()) AS exercise_names,
      COALESCE(agg.total_sets, 0) AS total_sets,
      COALESCE(agg.completed_sets, 0) AS completed_sets,
      COALESCE(agg.total_reps, 0) AS total_reps,
      COALESCE(agg.total_volume, 0) AS total_volume
    FROM workout_sessions s
    LEFT JOIN (
      SELECT
        ws.session_id,
        COUNT(*) AS total_sets,
        SUM(CASE WHEN ws.is_completed THEN 1 ELSE 0 END) AS completed_sets,
        SUM(CASE WHEN ws.is_completed THEN ws.reps ELSE 0 END) AS total_reps,
        SUM(CASE WHEN ws.is_completed
                 THEN ws.weight_kg * ws.reps * IF(e.is_dumbbell = TRUE, 2, 1)
                 ELSE 0 END) AS total_volume
      FROM workout_sets ws
      JOIN exercises e ON e.id = ws.exercise_id
      GROUP BY ws.session_id
    ) agg ON agg.session_id = s.id
    LEFT JOIN (
      SELECT session_id, JSON_ARRAYAGG(exercise_name) AS exercise_names
      FROM (
        -- The names are de-duplicated in a sub-query, because MySQL does
        -- not support DISTINCT inside JSON_ARRAYAGG.
        SELECT DISTINCT ws.session_id, e.name AS exercise_name
        FROM workout_sets ws
        JOIN exercises e ON e.id = ws.exercise_id
      ) unique_names
      GROUP BY session_id
    ) names_agg ON names_agg.session_id = s.id
    ${where}
    ORDER BY s.workout_date DESC, s.id DESC
    LIMIT ? OFFSET ?`;

  params.push(options.limit, options.offset);

  const rows = await queryRows<SessionListRow>(pool, sql, params);
  return rows.map((row) => ({
    ...row,
    exercise_names: Array.isArray(row.exercise_names) ? row.exercise_names : [],
    total_volume: round2(Number(row.total_volume)),
  }));
}

export async function getSession(id: number): Promise<WorkoutSession> {
  const session = await queryOne<SessionRow>(
    pool,
    `SELECT ${SESSION_COLUMNS} FROM workout_sessions WHERE id = ?`,
    [id],
  );
  if (!session) throw ApiError.notFound('Workout session not found.');
  return session;
}

/** Returns a session with its exercises and their sets, ready for display. */
export async function getSessionDetail(id: number): Promise<WorkoutSessionDetail> {
  const session = await getSession(id);

  const rows = await queryRows<SetWithExerciseRow>(
    pool,
    `SELECT ws.id, ws.session_id, ws.exercise_id, ws.workout_exercise_id, ws.set_number,
            ws.weight_kg, ws.reps, ws.is_completed, ws.completed_at,
            e.name AS exercise_name, e.muscle_group, e.is_dumbbell
     FROM workout_sets ws
     JOIN exercises e ON e.id = ws.exercise_id
     WHERE ws.session_id = ?
     ORDER BY e.name ASC, ws.set_number ASC`,
    [id],
  );

  const sets = rows.map((row) => ({
    ...row,
    weight_kg: Number(row.weight_kg),
    is_completed: Boolean(row.is_completed),
  }));

  // Group the sets by exercise so each exercise shows its own totals.
  const exercises: WorkoutExerciseRecord[] = [];
  const byExercise = new Map<number, WorkoutExerciseRecord>();

  for (const set of sets) {
    const entry = byExercise.get(set.exercise_id);
    if (entry) {
      entry.sets.push(set);
      continue;
    }

    const record: WorkoutExerciseRecord = {
      id: set.workout_exercise_id ?? 0,
      session_id: set.session_id,
      exercise_id: set.exercise_id,
      position: 0,
      exercise_name: set.exercise_name,
      muscle_group: set.muscle_group,
      is_dumbbell: Boolean(set.is_dumbbell),
      sets: [set],
      total_reps: 0,
      total_volume: 0,
      completed_sets: 0,
    };
    byExercise.set(set.exercise_id, record);
    exercises.push(record);
  }

  for (const record of exercises) {
    const totals = totalsForSets(record.sets, record.is_dumbbell);
    record.total_reps = totals.reps;
    record.total_volume = totals.volume;
    record.completed_sets = totals.completed;
  }

  // The session total is the sum of the per-exercise totals, so each
  // exercise is counted with its own dumbbell convention.
  const totals = exercises.reduce(
    (sum, record) => ({
      volume: sum.volume + record.total_volume,
      reps: sum.reps + record.total_reps,
      completed: sum.completed + record.completed_sets,
    }),
    { volume: 0, reps: 0, completed: 0 },
  );

  const exerciseNames = [...new Set(sets.map((set) => set.exercise_name))];

  return {
    ...session,
    sets,
    exercises,
    total_reps: totals.reps,
    total_volume: totals.volume,
    total_sets: sets.length,
    completed_sets: totals.completed,
    exercise_names: exerciseNames,
  };
}

export async function createSession(input: {
  workout_date: string;
  day_of_week?: number | null;
  start_time?: string | null;
  duration_minutes?: number | null;
  notes?: string | null;
  status?: 'in_progress' | 'completed';
  title?: string | null;
  ended_at?: string | null;
}): Promise<WorkoutSession> {
  // The weekday is derived from the date when it is not given, so every
  // session is filed under the right day automatically.
  const dayOfWeek =
    input.day_of_week ?? dayOfWeekForDate(input.workout_date);

  const result = await execute(
    pool,
    `INSERT INTO workout_sessions
       (workout_date, day_of_week, start_time, duration_minutes, notes, status, title, ended_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      input.workout_date,
      dayOfWeek,
      input.start_time ?? null,
      input.duration_minutes ?? null,
      input.notes ?? null,
      input.status ?? 'in_progress',
      input.title ?? null,
      input.ended_at ?? null,
    ],
  );
  return getSession(result.insertId);
}

export async function updateSession(
  id: number,
  changes: {
    workout_date?: string;
    day_of_week?: number | null;
    start_time?: string | null;
    duration_minutes?: number | null;
    notes?: string | null;
    status?: 'in_progress' | 'completed';
    title?: string | null;
    ended_at?: string | null;
  },
): Promise<WorkoutSession> {
  const fields: string[] = [];
  const params: (string | number | null)[] = [];

  if (changes.workout_date !== undefined) {
    fields.push('workout_date = ?');
    params.push(changes.workout_date);
  }
  if (changes.day_of_week !== undefined) {
    fields.push('day_of_week = ?');
    params.push(changes.day_of_week);
  }
  if (changes.start_time !== undefined) {
    fields.push('start_time = ?');
    params.push(changes.start_time);
  }
  if (changes.duration_minutes !== undefined) {
    fields.push('duration_minutes = ?');
    params.push(changes.duration_minutes);
  }
  if (changes.notes !== undefined) {
    fields.push('notes = ?');
    params.push(changes.notes);
  }
  if (changes.status !== undefined) {
    fields.push('status = ?');
    params.push(changes.status);
  }
  if (changes.title !== undefined) {
    fields.push('title = ?');
    params.push(changes.title);
  }
  if (changes.ended_at !== undefined) {
    fields.push('ended_at = ?');
    params.push(changes.ended_at);
  }

  if (fields.length === 0) {
    throw ApiError.badRequest('Provide at least one field to update.');
  }

  params.push(id);
  await execute(pool, `UPDATE workout_sessions SET ${fields.join(', ')} WHERE id = ?`, params);

  return getSession(id);
}

/** Deletes a session. Its sets are removed by the ON DELETE CASCADE. */
export async function deleteSession(id: number): Promise<void> {
  const result = await execute(pool, 'DELETE FROM workout_sessions WHERE id = ?', [id]);
  if (result.affectedRows === 0) {
    throw ApiError.notFound('Workout session not found.');
  }
}

/**
 * Returns the open session for a date, if there is one. Used to resume an
 * unfinished workout instead of creating a second session for the same day.
 */
export async function findOpenSession(workoutDate: string): Promise<WorkoutSession | null> {
  return queryOne<SessionRow>(
    pool,
    `SELECT ${SESSION_COLUMNS}
     FROM workout_sessions
     WHERE workout_date = ? AND status = 'in_progress'
     ORDER BY id DESC
     LIMIT 1`,
    [workoutDate],
  );
}
