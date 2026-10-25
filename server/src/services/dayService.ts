import type { RowDataPacket } from 'mysql2';
import { pool } from '../config/database.js';
import { execute, queryOne, queryRows } from '../config/query.js';
import { ApiError } from '../middleware/errors.js';
import { round2, setVolume } from '../utils/volume.js';

/** A day of the programme. 1 = Monday … 7 = Sunday. */
export type DayOfWeek = 1 | 2 | 3 | 4 | 5 | 6 | 7;

export const DAY_NAMES: Record<number, string> = {
  1: 'Monday',
  2: 'Tuesday',
  3: 'Wednesday',
  4: 'Thursday',
  5: 'Friday',
  6: 'Saturday',
  7: 'Sunday',
};

export const DAY_SHORT_NAMES: Record<number, string> = {
  1: 'Mon',
  2: 'Tue',
  3: 'Wed',
  4: 'Thu',
  5: 'Fri',
  6: 'Sat',
  7: 'Sun',
};

/** One exercise of a day's programme. */
export interface DayProgrammeExercise {
  exercise_id: number;
  name: string;
  muscle_group: string | null;
  is_dumbbell: boolean;
  default_sets: number;
  position: number;
}

/** The programme of one day. */
export interface DayProgramme {
  day_of_week: number;
  day_name: string;
  title: string;
  estimated_minutes: number | null;
  is_rest_day: boolean;
  exercises: DayProgrammeExercise[];
}

/** The previous session of a day, with every set of every exercise. */
export interface DayPreviousSession {
  session_id: number;
  workout_date: string;
  duration_minutes: number | null;
  notes: string | null;
  total_exercises: number;
  completed_sets: number;
  total_sets: number;
  total_reps: number;
  total_volume: number;
  /** The previous values of each exercise, keyed by exercise id. */
  exercises: Array<{
    exercise_id: number;
    exercise_name: string;
    is_dumbbell: boolean;
    sets: Array<{ set_number: number; weight_kg: number; reps: number; is_completed: boolean }>;
    total_reps: number;
    total_volume: number;
  }>;
}

/** A saved session of a day, as it appears in the day's history list. */
export interface DaySessionSummary {
  session_id: number;
  workout_date: string;
  day_of_week: number;
  status: 'in_progress' | 'completed';
  duration_minutes: number | null;
  total_exercises: number;
  completed_sets: number;
  total_sets: number;
  total_reps: number;
  total_volume: number;
}

type ProgrammeRow = RowDataPacket & {
  day_of_week: number;
  day_name: string;
  title: string;
  estimated_minutes: number | null;
  is_rest_day: number;
};

type ProgrammeExerciseRow = RowDataPacket & {
  exercise_id: number;
  name: string;
  muscle_group: string | null;
  is_dumbbell: number;
  default_sets: number;
  position: number;
};

/** Reads the programme row for a day, falling back to a sensible default. */
async function readProgrammeRow(day: number): Promise<ProgrammeRow> {
  const row = await queryOne<ProgrammeRow>(
    pool,
    `SELECT day_of_week,
            title,
            estimated_minutes,
            is_rest_day
     FROM day_programme
     WHERE day_of_week = ?`,
    [day],
  );

  if (!row) {
    // A day without a programme row is treated as a rest day rather than
    // an error, so a missing row can never break the dashboard.
    return {
      day_of_week: day,
      day_name: DAY_NAMES[day] ?? 'Unknown',
      title: 'Rest Day',
      estimated_minutes: null,
      is_rest_day: 1,
    } as ProgrammeRow;
  }

  return { ...row, day_name: DAY_NAMES[day] ?? 'Unknown' };
}

/** Reads the exercises of a day, in programme order. */
export async function getDayExercises(day: number): Promise<DayProgrammeExercise[]> {
  const rows = await queryRows<ProgrammeExerciseRow>(
    pool,
    `SELECT e.id AS exercise_id,
            e.name,
            e.muscle_group,
            e.is_dumbbell,
            e.default_sets,
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

/** Returns the full programme of one day. */
export async function getDayProgramme(day: number): Promise<DayProgramme> {
  const programme = await readProgrammeRow(day);
  const exercises = await getDayExercises(day);

  return {
    day_of_week: day,
    day_name: programme.day_name,
    title: programme.title,
    estimated_minutes: programme.estimated_minutes,
    is_rest_day: Boolean(programme.is_rest_day),
    exercises,
  };
}

/** Returns the whole week, ready for the dashboard strip. */
export async function getWeekProgramme(): Promise<
  Array<{
    day_of_week: number;
    day_name: string;
    short_name: string;
    title: string;
    estimated_minutes: number | null;
    is_rest_day: boolean;
    exercise_count: number;
  }>
> {
  const rows = await queryRows<
    RowDataPacket & {
      day_of_week: number;
      title: string;
      estimated_minutes: number | null;
      is_rest_day: number;
      exercise_count: number;
    }
  >(
    pool,
    `SELECT p.day_of_week,
            p.title,
            p.estimated_minutes,
            p.is_rest_day,
            (SELECT COUNT(*) FROM exercise_schedule s WHERE s.day_of_week = p.day_of_week) AS exercise_count
     FROM day_programme p
     ORDER BY p.day_of_week ASC`,
  );

  return rows.map((row) => ({
    day_of_week: row.day_of_week,
    day_name: DAY_NAMES[row.day_of_week] ?? 'Unknown',
    short_name: DAY_SHORT_NAMES[row.day_of_week] ?? '—',
    title: row.title,
    estimated_minutes: row.estimated_minutes,
    is_rest_day: Boolean(row.is_rest_day),
    exercise_count: Number(row.exercise_count),
  }));
}

/**
 * Returns the most recent completed session of a day, with every set of
 * every exercise. This is the "previous workout" shown beside the new
 * input fields.
 */
export async function getDayPreviousSession(
  day: number,
  beforeDate?: string,
): Promise<DayPreviousSession | null> {
  const params: (number | string)[] = [day];
  let dateClause = '';
  if (beforeDate) {
    dateClause = 'AND s.workout_date < ?';
    params.push(beforeDate);
  }

  // The latest completed session of that weekday.
  const session = await queryOne<
    RowDataPacket & {
      session_id: number;
      workout_date: string;
      duration_minutes: number | null;
      notes: string | null;
    }
  >(
    pool,
    `SELECT s.id AS session_id, s.workout_date, s.duration_minutes, s.notes
     FROM workout_sessions s
     WHERE s.day_of_week = ? AND s.status = 'completed' ${dateClause}
     ORDER BY s.workout_date DESC, s.id DESC
     LIMIT 1`,
    params,
  );

  if (!session) return null;

  const setRows = await queryRows<
    RowDataPacket & {
      exercise_id: number;
      exercise_name: string;
      is_dumbbell: number;
      set_number: number;
      weight_kg: number;
      reps: number;
      is_completed: number;
    }
  >(
    pool,
    `SELECT ws.exercise_id,
            e.name AS exercise_name,
            e.is_dumbbell,
            ws.set_number,
            ws.weight_kg,
            ws.reps,
            ws.is_completed
     FROM workout_sets ws
     JOIN exercises e ON e.id = ws.exercise_id
     WHERE ws.session_id = ?
     ORDER BY e.name ASC, ws.set_number ASC`,
    [session.session_id],
  );

  const exercises: DayPreviousSession['exercises'] = [];

  for (const row of setRows) {
    let entry = exercises.find((item) => item.exercise_id === row.exercise_id);
    if (!entry) {
      entry = {
        exercise_id: row.exercise_id,
        exercise_name: row.exercise_name,
        is_dumbbell: Boolean(row.is_dumbbell),
        sets: [],
        total_reps: 0,
        total_volume: 0,
      };
      exercises.push(entry);
    }

    const isCompleted = Boolean(row.is_completed);
    entry.sets.push({
      set_number: row.set_number,
      weight_kg: Number(row.weight_kg),
      reps: Number(row.reps),
      is_completed: isCompleted,
    });

    // Only completed sets count towards the totals.
    if (isCompleted) {
      entry.total_reps += Number(row.reps);
      entry.total_volume += setVolume(
        Number(row.weight_kg),
        Number(row.reps),
        Boolean(row.is_dumbbell),
      );
    }
  }

  for (const entry of exercises) {
    entry.total_volume = round2(entry.total_volume);
    entry.sets.sort((a, b) => a.set_number - b.set_number);
  }

  const totalVolume = exercises.reduce((sum, entry) => sum + entry.total_volume, 0);
  const totalReps = exercises.reduce((sum, entry) => sum + entry.total_reps, 0);
  const completedSets = exercises.reduce(
    (sum, entry) => sum + entry.sets.filter((set) => set.is_completed).length,
    0,
  );

  return {
    session_id: session.session_id,
    workout_date: session.workout_date,
    duration_minutes: session.duration_minutes,
    notes: session.notes,
    total_exercises: exercises.length,
    completed_sets: completedSets,
    total_sets: setRows.length,
    total_reps: totalReps,
    total_volume: round2(totalVolume),
    exercises,
  };
}

/**
 * Returns every saved session of a day, newest first. This is the day's
 * history list.
 */
export async function listDaySessions(day: number): Promise<DaySessionSummary[]> {
  const rows = await queryRows<
    RowDataPacket & {
      session_id: number;
      workout_date: string;
      day_of_week: number;
      status: 'in_progress' | 'completed';
      duration_minutes: number | null;
      total_exercises: number;
      completed_sets: number;
      total_sets: number;
      total_reps: number;
      total_volume: number;
    }
  >(
    pool,
    `SELECT s.id AS session_id,
            s.workout_date,
            s.day_of_week,
            s.status,
            s.duration_minutes,
            COUNT(DISTINCT ws.exercise_id) AS total_exercises,
            COALESCE(SUM(CASE WHEN ws.is_completed THEN 1 ELSE 0 END), 0) AS completed_sets,
            COUNT(ws.id) AS total_sets,
            COALESCE(SUM(CASE WHEN ws.is_completed THEN ws.reps ELSE 0 END), 0) AS total_reps,
            COALESCE(SUM(CASE WHEN ws.is_completed
                              THEN ws.weight_kg * ws.reps * IF(e.is_dumbbell = TRUE, 2, 1)
                              ELSE 0 END), 0) AS total_volume
     FROM workout_sessions s
     LEFT JOIN workout_sets ws ON ws.session_id = s.id
     LEFT JOIN exercises e ON e.id = ws.exercise_id
     WHERE s.day_of_week = ?
     GROUP BY s.id, s.workout_date, s.day_of_week, s.status, s.duration_minutes
     ORDER BY s.workout_date DESC, s.id DESC`,
    [day],
  );

  return rows.map((row) => ({
    session_id: row.session_id,
    workout_date: row.workout_date,
    day_of_week: row.day_of_week,
    status: row.status,
    duration_minutes: row.duration_minutes,
    total_exercises: Number(row.total_exercises),
    completed_sets: Number(row.completed_sets),
    total_sets: Number(row.total_sets),
    total_reps: Number(row.total_reps),
    total_volume: round2(Number(row.total_volume)),
  }));
}

/**
 * Returns the open (unfinished) session of a day, so a workout can be
 * resumed instead of started again.
 */
export async function findDayOpenSession(day: number): Promise<{ id: number } | null> {
  return queryOne<RowDataPacket & { id: number }>(
    pool,
    `SELECT id FROM workout_sessions
     WHERE day_of_week = ? AND status = 'in_progress'
     ORDER BY id DESC
     LIMIT 1`,
    [day],
  );
}

/**
 * Replaces the programme of a day with the given exercises, in order.
 * The title of the day can be changed at the same time.
 */
export async function setDayProgramme(
  day: number,
  exerciseIds: number[],
  title?: string,
): Promise<DayProgramme> {
  if (day < 1 || day > 7) {
    throw ApiError.badRequest('Day must be between 1 (Monday) and 7 (Sunday).');
  }

  const unique = [...new Set(exerciseIds)];

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

    if (title !== undefined && title.trim() !== '') {
      await execute(
        connection,
        `INSERT INTO day_programme (day_of_week, title, is_rest_day)
         VALUES (?, ?, FALSE)
         ON DUPLICATE KEY UPDATE title = VALUES(title), is_rest_day = FALSE`,
        [day, title.trim()],
      );
    }

    await connection.commit();
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }

  return getDayProgramme(day);
}
