import type { RowDataPacket } from 'mysql2';
import { pool } from '../config/database.js';
import { execute, queryOne, queryRows } from '../config/query.js';
import { ApiError } from '../middleware/errors.js';
import type { DayOfWeek, ScheduleEntry, WeeklySchedule } from '../types/index.js';

/** The weekdays the programme covers. Sunday (7) is the rest day. */
export const TRAINING_DAYS: DayOfWeek[] = [1, 2, 3, 4, 5, 6];

const DAY_NAMES: Record<number, string> = {
  1: 'Monday',
  2: 'Tuesday',
  3: 'Wednesday',
  4: 'Thursday',
  5: 'Friday',
  6: 'Saturday',
  7: 'Sunday',
};

/** Human-readable name for a day index. */
export function dayName(day: number): string {
  return DAY_NAMES[day] ?? 'Unknown';
}

type ScheduleRow = RowDataPacket & {
  exercise_id: number;
  name: string;
  muscle_group: string | null;
  is_dumbbell: number;
  default_sets: number;
  day_of_week: number;
  position: number;
};

/** Reads the programme rows for a single day. */
export async function getScheduleForDay(day: number): Promise<ScheduleEntry[]> {
  const rows = await queryRows<ScheduleRow>(
    pool,
    `SELECT e.id AS exercise_id,
            e.name,
            e.muscle_group,
            e.is_dumbbell,
            e.default_sets,
            s.day_of_week,
            s.position
     FROM exercise_schedule s
     JOIN exercises e ON e.id = s.exercise_id
     WHERE s.day_of_week = ?
     ORDER BY s.position ASC, e.name ASC`,
    [day],
  );

  return rows.map((row) => ({
    exercise_id: row.exercise_id,
    name: row.name,
    muscle_group: row.muscle_group,
    is_dumbbell: Boolean(row.is_dumbbell),
    default_sets: row.default_sets,
    position: row.position,
  }));
}

/** Reads the whole Monday–Saturday programme. */
export async function getWeeklySchedule(): Promise<WeeklySchedule> {
  const days: Record<number, ScheduleEntry[]> = {};

  const rows = await queryRows<ScheduleRow>(
    pool,
    `SELECT e.id AS exercise_id,
            e.name,
            e.muscle_group,
            e.is_dumbbell,
            e.default_sets,
            s.day_of_week,
            s.position
     FROM exercise_schedule s
     JOIN exercises e ON e.id = s.exercise_id
     ORDER BY s.day_of_week ASC, s.position ASC, e.name ASC`,
  );

  for (const row of rows) {
    const list = days[row.day_of_week] ?? [];
    list.push({
      exercise_id: row.exercise_id,
      name: row.name,
      muscle_group: row.muscle_group,
      is_dumbbell: Boolean(row.is_dumbbell),
      default_sets: row.default_sets,
      position: row.position,
    });
    days[row.day_of_week] = list;
  }

  return { days, rest_day: 7 };
}

/** Replaces the schedule of one day with the given exercises, in order. */
export async function setScheduleForDay(
  day: number,
  exerciseIds: number[],
): Promise<ScheduleEntry[]> {
  if (day < 1 || day > 7) {
    throw ApiError.badRequest('Day must be between 1 (Monday) and 7 (Sunday).');
  }

  const unique = [...new Set(exerciseIds)];

  // Every exercise must exist before it can be scheduled.
  if (unique.length > 0) {
    const placeholders = unique.map(() => '?').join(', ');
    const rows = await queryRows<RowDataPacket & { id: number }>(
      pool,
      `SELECT id FROM exercises WHERE id IN (${placeholders})`,
      unique,
    );
    if (rows.length !== unique.length) {
      throw ApiError.badRequest('One or more exercises could not be found.');
    }
  }

  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();

    await execute(connection, 'DELETE FROM exercise_schedule WHERE day_of_week = ?', [day]);

    for (const [index, exerciseId] of unique.entries()) {
      await execute(
        connection,
        'INSERT INTO exercise_schedule (exercise_id, day_of_week, position) VALUES (?, ?, ?)',
        [exerciseId, day, index + 1],
      );
    }

    await connection.commit();
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }

  return getScheduleForDay(day);
}

/** Removes an exercise from the programme entirely. */
export async function removeExerciseFromSchedule(
  exerciseId: number,
): Promise<void> {
  const result = await execute(
    pool,
    'DELETE FROM exercise_schedule WHERE exercise_id = ?',
    [exerciseId],
  );
  if (result.affectedRows === 0) {
    throw ApiError.notFound('This exercise is not part of the programme.');
  }
}

/** Returns the day index for a date string, 1 = Monday … 7 = Sunday. */
export function dayOfWeekForDate(date: string): number {
  const [year, month, day] = date.split('-').map(Number);
  const parsed = new Date(year ?? 1970, (month ?? 1) - 1, day ?? 1);
  // `getDay()` returns 0 for Sunday; shift it so Monday is 1 and Sunday is 7.
  return parsed.getDay() === 0 ? 7 : parsed.getDay();
}

/** Confirms the exercise exists, returning its id. */
export async function assertExerciseExists(exerciseId: number): Promise<void> {
  const row = await queryOne<RowDataPacket & { id: number }>(
    pool,
    'SELECT id FROM exercises WHERE id = ?',
    [exerciseId],
  );
  if (!row) throw ApiError.notFound('Exercise not found.');
}
