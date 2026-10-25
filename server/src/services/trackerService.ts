import type { RowDataPacket } from 'mysql2';
import { pool } from '../config/database.js';
import { queryOne, queryRows } from '../config/query.js';
import { ApiError } from '../middleware/errors.js';
import type {
  ExerciseRecords,
  ExerciseTracker,
  PersonalRecord,
  TrackerDelta,
  TrackerSession,
  TrackerSet,
  WeekTotals,
  WeeklyOverview,
} from '../types/index.js';
import { round2, totalsForSets } from '../utils/volume.js';

/** Date range filter applied to the tracked sessions. */
export interface RangeOptions {
  from?: string;
  to?: string;
}

type SessionRow = RowDataPacket & {
  session_id: number;
  workout_date: string;
  set_number: number;
  weight_kg: number;
  reps: number;
  is_completed: number;
};

/** Builds the SQL fragment that filters sessions by date range. */
function rangeClause(options: RangeOptions): { sql: string; params: string[] } {
  const conditions: string[] = [];
  const params: string[] = [];

  if (options.from) {
    conditions.push('s.workout_date >= ?');
    params.push(options.from);
  }
  if (options.to) {
    conditions.push('s.workout_date <= ?');
    params.push(options.to);
  }

  return {
    sql: conditions.length > 0 ? `AND ${conditions.join(' AND ')}` : '',
    params,
  };
}

/**
 * Returns every session that recorded the exercise, with its sets.
 *
 * Only completed sets count towards the totals. Sessions that recorded the
 * exercise but completed nothing are still listed, so the history shows
 * every workout the exercise was part of.
 */
export async function getExerciseTracker(
  exerciseId: number,
  options: RangeOptions = {},
): Promise<ExerciseTracker> {
  const exercise = await queryOne<
    RowDataPacket & { id: number; name: string; muscle_group: string | null; is_dumbbell: number }
  >(pool, 'SELECT id, name, muscle_group, is_dumbbell FROM exercises WHERE id = ?', [exerciseId]);

  if (!exercise) throw ApiError.notFound('Exercise not found.');

  const isDumbbell = Boolean(exercise.is_dumbbell);
  const range = rangeClause(options);

  const rows = await queryRows<SessionRow>(
    pool,
    `SELECT ws.session_id,
            s.workout_date,
            ws.set_number,
            ws.weight_kg,
            ws.reps,
            ws.is_completed
     FROM workout_sets ws
     JOIN workout_sessions s ON s.id = ws.session_id
     WHERE ws.exercise_id = ? ${range.sql}
     ORDER BY s.workout_date ASC, s.id ASC, ws.set_number ASC`,
    [exerciseId, ...range.params],
  );

  // Group the sets into one entry per session.
  const bySession = new Map<number, TrackerSession>();

  for (const row of rows) {
    const set: TrackerSet = {
      set_number: row.set_number,
      weight_kg: Number(row.weight_kg),
      reps: Number(row.reps),
      is_completed: Boolean(row.is_completed),
    };

    const entry = bySession.get(row.session_id);
    if (entry) {
      entry.sets.push(set);
    } else {
      bySession.set(row.session_id, {
        session_id: row.session_id,
        workout_date: row.workout_date,
        sets: [set],
        total_reps: 0,
        total_volume: 0,
        completed_sets: 0,
        top_weight: 0,
      });
    }
  }

  const sessions = [...bySession.values()]
    .sort((a, b) => a.workout_date.localeCompare(b.workout_date))
    .map((session) => {
      const totals = totalsForSets(session.sets, isDumbbell);
      const completedSets = session.sets.filter((set) => set.is_completed);
      const topWeight = completedSets.length
        ? Math.max(...completedSets.map((set) => set.weight_kg))
        : 0;

      return {
        ...session,
        sets: session.sets.sort((a, b) => a.set_number - b.set_number),
        total_reps: totals.reps,
        total_volume: totals.volume,
        completed_sets: totals.completed,
        top_weight: topWeight,
      };
    });

  const latest = sessions.length > 0 ? sessions[sessions.length - 1]! : null;
  const previous = sessions.length > 1 ? sessions[sessions.length - 2]! : null;

  return {
    exercise_id: exercise.id,
    exercise_name: exercise.name,
    muscle_group: exercise.muscle_group,
    is_dumbbell: isDumbbell,
    sessions,
    latest,
    previous,
    delta: buildDelta(latest, previous),
    records: buildRecords(sessions),
  };
}

/**
 * Compares the latest session with the one before it. Each value is the
 * difference between the two sessions; `null` means there is not enough
 * data to compare yet.
 */
export function buildDelta(
  latest: TrackerSession | null,
  previous: TrackerSession | null,
): TrackerDelta {
  if (!latest || !previous) {
    return { weight: null, reps: null, volume: null, direction: 'none' };
  }

  const weight = round2(latest.top_weight - previous.top_weight);
  const reps = latest.total_reps - previous.total_reps;
  const volume = round2(latest.total_volume - previous.total_volume);

  // The overall direction follows the volume, which reflects both the load
  // and the repetitions.
  let direction: TrackerDelta['direction'] = 'flat';
  if (volume > 0) direction = 'up';
  else if (volume < 0) direction = 'down';

  return { weight, reps, volume, direction };
}

/** Derives the personal records for a list of sessions. */
export function buildRecords(sessions: TrackerSession[]): ExerciseRecords {
  let highestWeight: { value: number; date: string; reps: number } | null = null;
  let mostReps: { value: number; weight: number; date: string } | null = null;
  let bestVolume: { value: number; date: string } | null = null;

  for (const session of sessions) {
    for (const set of session.sets) {
      if (!set.is_completed) continue;

      if (
        !highestWeight ||
        set.weight_kg > highestWeight.value ||
        // On a tie the set with more reps is the better record.
        (set.weight_kg === highestWeight.value && set.reps > highestWeight.reps)
      ) {
        highestWeight = { value: set.weight_kg, date: session.workout_date, reps: set.reps };
      }

      if (!mostReps || set.reps > mostReps.value) {
        mostReps = { value: set.reps, weight: set.weight_kg, date: session.workout_date };
      }
    }

    if (session.completed_sets > 0) {
      if (!bestVolume || session.total_volume > bestVolume.value) {
        bestVolume = { value: session.total_volume, date: session.workout_date };
      }
    }
  }

  return {
    highest_weight: highestWeight?.value ?? null,
    highest_weight_date: highestWeight?.date ?? null,
    highest_weight_reps: highestWeight?.reps ?? null,
    most_reps: mostReps?.value ?? null,
    most_reps_weight: mostReps?.weight ?? null,
    most_reps_date: mostReps?.date ?? null,
    best_volume: bestVolume?.value ?? null,
    best_volume_date: bestVolume?.date ?? null,
  };
}

/** Returns the Monday-based start date of the week containing a date. */
function startOfWeek(date: string): string {
  const [year, month, day] = date.split('-').map(Number);
  const parsed = new Date(year ?? 1970, (month ?? 1) - 1, day ?? 1);
  const weekday = parsed.getDay() === 0 ? 7 : parsed.getDay();
  parsed.setDate(parsed.getDate() - (weekday - 1));
  return toIso(parsed);
}

/** Formats a Date as `YYYY-MM-DD`. */
function toIso(date: Date): string {
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${date.getFullYear()}-${month}-${day}`;
}

/** Builds the totals for one week. */
async function totalsForWeek(weekStart: string): Promise<WeekTotals> {
  const start = new Date(`${weekStart}T00:00:00`);
  const end = new Date(start);
  end.setDate(end.getDate() + 6);

  const from = weekStart;
  const to = toIso(end);

  const row = await queryOne<
    RowDataPacket & {
      workouts: number;
      exercises_completed: number;
      completed_sets: number;
      total_reps: number;
      total_volume: number;
    }
  >(
    pool,
    `SELECT
       COUNT(DISTINCT s.id) AS workouts,
       COUNT(DISTINCT CASE WHEN ws.is_completed = TRUE THEN ws.exercise_id END) AS exercises_completed,
       COALESCE(SUM(CASE WHEN ws.is_completed = TRUE THEN 1 ELSE 0 END), 0) AS completed_sets,
       COALESCE(SUM(CASE WHEN ws.is_completed = TRUE THEN ws.reps ELSE 0 END), 0) AS total_reps,
       COALESCE(SUM(
         CASE WHEN ws.is_completed = TRUE
              THEN ws.weight_kg * ws.reps * IF(e.is_dumbbell = TRUE, 2, 1)
              ELSE 0 END
       ), 0) AS total_volume
     FROM workout_sessions s
     LEFT JOIN workout_sets ws ON ws.session_id = s.id
     LEFT JOIN exercises e ON e.id = ws.exercise_id
     WHERE s.workout_date BETWEEN ? AND ?`,
    [from, to],
  );

  return {
    week_start: from,
    week_end: to,
    workouts: Number(row?.workouts ?? 0),
    exercises_completed: Number(row?.exercises_completed ?? 0),
    completed_sets: Number(row?.completed_sets ?? 0),
    total_reps: Number(row?.total_reps ?? 0),
    total_volume: round2(Number(row?.total_volume ?? 0)),
  };
}

/**
 * Returns this week's totals next to the week before, so the two can be
 * compared on the dashboard and the progress screen.
 */
export async function getWeeklyOverview(referenceDate?: string): Promise<WeeklyOverview> {
  const today = referenceDate ?? toIso(new Date());
  const currentStart = startOfWeek(today);

  const previousDate = new Date(`${currentStart}T00:00:00`);
  previousDate.setDate(previousDate.getDate() - 7);
  const previousStart = toIso(previousDate);

  const [current, previous] = await Promise.all([
    totalsForWeek(currentStart),
    totalsForWeek(previousStart),
  ]);

  return { current, previous };
}

type RecordRow = RowDataPacket & {
  exercise_id: number;
  exercise_name: string;
  muscle_group: string | null;
  is_dumbbell: number;
  workout_date: string;
  session_id: number;
  set_number: number;
  weight_kg: number;
  reps: number;
};

/**
 * Returns the personal record of every exercise that has at least one
 * completed set. Only saved workout data is counted — nothing is invented.
 */
export async function getAllPersonalRecords(): Promise<PersonalRecord[]> {
  const rows = await queryRows<RecordRow>(
    pool,
    `SELECT e.id AS exercise_id,
            e.name AS exercise_name,
            e.muscle_group,
            e.is_dumbbell,
            s.workout_date,
            s.id AS session_id,
            ws.set_number,
            ws.weight_kg,
            ws.reps
     FROM workout_sets ws
     JOIN workout_sessions s ON s.id = ws.session_id
     JOIN exercises e ON e.id = ws.exercise_id
     WHERE ws.is_completed = TRUE
     ORDER BY e.name ASC, s.workout_date ASC, ws.set_number ASC`,
  );

  // Group the completed sets by exercise.
  const byExercise = new Map<number, RecordRow[]>();
  for (const row of rows) {
    const list = byExercise.get(row.exercise_id) ?? [];
    list.push(row);
    byExercise.set(row.exercise_id, list);
  }

  const records: PersonalRecord[] = [];

  for (const [exerciseId, sets] of byExercise) {
    const first = sets[0]!;
    const isDumbbell = Boolean(first.is_dumbbell);

    // Highest weight — heavier wins, on a tie more reps wins.
    let highest = sets[0]!;
    for (const set of sets) {
      if (
        set.weight_kg > highest.weight_kg ||
        (set.weight_kg === highest.weight_kg && set.reps > highest.reps)
      ) {
        highest = set;
      }
    }

    // Most reps at a single weight.
    let mostReps = sets[0]!;
    for (const set of sets) {
      if (set.reps > mostReps.reps) mostReps = set;
    }

    // Best total volume in one session.
    const volumeBySession = new Map<number, { volume: number; date: string }>();
    for (const set of sets) {
      const entry = volumeBySession.get(set.session_id) ?? {
        volume: 0,
        date: set.workout_date,
      };
      entry.volume += set.weight_kg * set.reps * (isDumbbell ? 2 : 1);
      volumeBySession.set(set.session_id, entry);
    }

    let bestVolume = [...volumeBySession.values()][0]!;
    for (const entry of volumeBySession.values()) {
      if (entry.volume > bestVolume.volume) bestVolume = entry;
    }

    records.push({
      exercise_id: exerciseId,
      exercise_name: first.exercise_name,
      muscle_group: first.muscle_group,
      is_dumbbell: isDumbbell,
      best_weight: Number(highest.weight_kg),
      best_weight_reps: Number(highest.reps),
      achieved_on: highest.workout_date,
      best_reps: Number(mostReps.reps),
      best_reps_weight: Number(mostReps.weight_kg),
      best_reps_on: mostReps.workout_date,
      best_volume: round2(bestVolume.volume),
      best_volume_on: bestVolume.date,
    });
  }

  // Strongest records first.
  records.sort(
    (a, b) => b.best_weight - a.best_weight || a.exercise_name.localeCompare(b.exercise_name),
  );

  return records;
}
