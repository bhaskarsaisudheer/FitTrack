import type { RowDataPacket } from 'mysql2';
import { pool } from '../config/database.js';
import { execute, queryOne, queryRows } from '../config/query.js';
import { ApiError } from '../middleware/errors.js';
import type { Exercise } from '../types/index.js';

type ExerciseRow = RowDataPacket &
  Omit<Exercise, 'is_dumbbell' | 'schedule_days'> & {
    is_dumbbell: number;
    schedule_days: string | null;
  };

interface ListOptions {
  search?: string;
  muscle_group?: string;
}

/** Turns the comma-separated day list into numbers. */
function parseDays(raw: string | null): number[] {
  if (!raw) return [];
  return raw
    .split(',')
    .map((value) => Number.parseInt(value, 10))
    .filter((value) => Number.isInteger(value) && value >= 1 && value <= 7);
}

/** Maps a database row onto the API shape. */
function toExercise(row: ExerciseRow): Exercise {
  return {
    id: row.id,
    name: row.name,
    muscle_group: row.muscle_group,
    is_dumbbell: Boolean(row.is_dumbbell),
    default_sets: row.default_sets,
    created_at: row.created_at,
    schedule_days: parseDays(row.schedule_days),
  };
}

/**
 * The exercise library, with the days each exercise is scheduled on.
 * The schedule is aggregated in a sub-query so every row comes back with
 * its programme days in one round trip.
 */
const EXERCISE_SELECT = `
  SELECT e.id,
         e.name,
         e.muscle_group,
         e.is_dumbbell,
         e.default_sets,
         e.created_at,
         (SELECT GROUP_CONCAT(s.day_of_week ORDER BY s.day_of_week)
            FROM exercise_schedule s
           WHERE s.exercise_id = e.id) AS schedule_days
  FROM exercises e`;

export async function listExercises(options: ListOptions = {}): Promise<Exercise[]> {
  const conditions: string[] = [];
  const params: (string | number)[] = [];

  if (options.search) {
    conditions.push('(e.name LIKE ? OR IFNULL(e.muscle_group, "") LIKE ?)');
    const term = `%${options.search}%`;
    params.push(term, term);
  }

  if (options.muscle_group) {
    conditions.push('e.muscle_group = ?');
    params.push(options.muscle_group);
  }

  const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
  const sql = `${EXERCISE_SELECT} ${where} ORDER BY e.name ASC`;

  const rows = await queryRows<ExerciseRow>(pool, sql, params);
  return rows.map(toExercise);
}

export async function getExercise(id: number): Promise<Exercise> {
  const exercise = await queryOne<ExerciseRow>(
    pool,
    `${EXERCISE_SELECT} WHERE e.id = ?`,
    [id],
  );
  if (!exercise) throw ApiError.notFound('Exercise not found.');
  return toExercise(exercise);
}

export async function createExercise(
  name: string,
  muscleGroup: string | null,
  isDumbbell = false,
  defaultSets = 3,
): Promise<Exercise> {
  const result = await execute(
    pool,
    'INSERT INTO exercises (name, muscle_group, is_dumbbell, default_sets) VALUES (?, ?, ?, ?)',
    [name, muscleGroup, isDumbbell, defaultSets],
  );
  return getExercise(result.insertId);
}

export async function updateExercise(
  id: number,
  changes: {
    name?: string;
    muscle_group?: string | null;
    is_dumbbell?: boolean;
    default_sets?: number;
  },
): Promise<Exercise> {
  const fields: string[] = [];
  const params: (string | number | null | boolean)[] = [];

  if (changes.name !== undefined) {
    fields.push('name = ?');
    params.push(changes.name);
  }
  if (changes.muscle_group !== undefined) {
    fields.push('muscle_group = ?');
    params.push(changes.muscle_group);
  }
  if (changes.is_dumbbell !== undefined) {
    fields.push('is_dumbbell = ?');
    params.push(changes.is_dumbbell);
  }
  if (changes.default_sets !== undefined) {
    fields.push('default_sets = ?');
    params.push(changes.default_sets);
  }

  if (fields.length === 0) {
    throw ApiError.badRequest('Provide at least one field to update.');
  }

  params.push(id);
  await execute(pool, `UPDATE exercises SET ${fields.join(', ')} WHERE id = ?`, params);

  return getExercise(id);
}

/**
 * Deletes an exercise. Exercises referenced by workout sets are protected by
 * a foreign key, so the delete is rejected with a clear 409 instead of
 * silently destroying history.
 */
export async function deleteExercise(id: number): Promise<void> {
  const result = await execute(pool, 'DELETE FROM exercises WHERE id = ?', [id]);
  if (result.affectedRows === 0) {
    throw ApiError.notFound('Exercise not found.');
  }
}

export async function countExerciseUses(id: number): Promise<number> {
  const row = await queryOne<RowDataPacket & { total: number }>(
    pool,
    'SELECT COUNT(*) AS total FROM workout_sets WHERE exercise_id = ?',
    [id],
  );
  return row?.total ?? 0;
}
