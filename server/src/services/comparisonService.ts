import type { RowDataPacket } from 'mysql2';
import { pool } from '../config/database.js';
import { queryOne, queryRows } from '../config/query.js';
import { round2, setVolume } from '../utils/volume.js';

/** One set of a previous session. */
export interface ComparisonSet {
  set_number: number;
  weight_kg: number;
  reps: number;
  is_completed: boolean;
}

/** The comparison between a previous session and the current one. */
export interface ExerciseComparison {
  exercise_id: number;
  exercise_name: string;
  is_dumbbell: boolean;
  previous: {
    sets: ComparisonSet[];
    total_reps: number;
    total_volume: number;
  } | null;
  current: {
    sets: ComparisonSet[];
    total_reps: number;
    total_volume: number;
  };
  /** Set-by-set weight and rep differences. */
  sets: Array<{
    set_number: number;
    previous_weight: number | null;
    previous_reps: number | null;
    current_weight: number | null;
    current_reps: number | null;
    weight_delta: number | null;
    reps_delta: number | null;
    direction: 'up' | 'down' | 'flat' | 'none';
  }>;
  /** The difference in total volume against the previous session. */
  volume_delta: number | null;
  /** The percentage change in volume, when a previous volume exists. */
  volume_percent: number | null;
  reps_delta: number | null;
  /** The overall direction of the session. */
  direction: 'up' | 'down' | 'flat' | 'none';
}

/** The comparison between two saved sessions. */
export interface SessionComparison {
  session_a: {
    session_id: number;
    workout_date: string;
    total_reps: number;
    total_volume: number;
    completed_sets: number;
    exercises: Array<{
      exercise_id: number;
      exercise_name: string;
      sets: ComparisonSet[];
      total_reps: number;
      total_volume: number;
    }>;
  };
  session_b: {
    session_id: number;
    workout_date: string;
    total_reps: number;
    total_volume: number;
    completed_sets: number;
    exercises: Array<{
      exercise_id: number;
      exercise_name: string;
      sets: ComparisonSet[];
      total_reps: number;
      total_volume: number;
    }>;
  };
  volume_delta: number;
  volume_percent: number | null;
  reps_delta: number;
  direction: 'up' | 'down' | 'flat' | 'none';
  /** Per-exercise comparison between the two sessions. */
  exercises: Array<{
    exercise_id: number;
    exercise_name: string;
    previous_volume: number;
    current_volume: number;
    volume_delta: number;
    volume_percent: number | null;
    direction: 'up' | 'down' | 'flat' | 'none';
  }>;
}

type SessionSetRow = RowDataPacket & {
  session_id: number;
  workout_date: string;
  exercise_id: number;
  exercise_name: string;
  is_dumbbell: number;
  set_number: number;
  weight_kg: number;
  reps: number;
  is_completed: number;
};

/** Reads every set of one session, grouped by exercise. */
async function readSessionSets(sessionId: number): Promise<{
  workout_date: string;
  exercises: Array<{
    exercise_id: number;
    exercise_name: string;
    is_dumbbell: boolean;
    sets: ComparisonSet[];
    total_reps: number;
    total_volume: number;
  }>;
  total_reps: number;
  total_volume: number;
  completed_sets: number;
}> {
  const rows = await queryRows<SessionSetRow>(
    pool,
    `SELECT ws.session_id,
            s.workout_date,
            ws.exercise_id,
            e.name AS exercise_name,
            e.is_dumbbell,
            ws.set_number,
            ws.weight_kg,
            ws.reps,
            ws.is_completed
     FROM workout_sets ws
     JOIN workout_sessions s ON s.id = ws.session_id
     JOIN exercises e ON e.id = ws.exercise_id
     WHERE ws.session_id = ?
     ORDER BY e.name ASC, ws.set_number ASC`,
    [sessionId],
  );

  // A session with no sets has no date in the rows above, so the date is
  // read from the session itself.
  const session = await queryOne<RowDataPacket & { workout_date: string }>(
    pool,
    'SELECT workout_date FROM workout_sessions WHERE id = ?',
    [sessionId],
  );

  const exercises: Array<{
    exercise_id: number;
    exercise_name: string;
    is_dumbbell: boolean;
    sets: ComparisonSet[];
    total_reps: number;
    total_volume: number;
  }> = [];

  for (const row of rows) {
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

  return {
    workout_date: session?.workout_date ?? rows[0]?.workout_date ?? '',
    exercises,
    total_reps: exercises.reduce((sum, entry) => sum + entry.total_reps, 0),
    total_volume: round2(exercises.reduce((sum, entry) => sum + entry.total_volume, 0)),
    completed_sets: rows.filter((row) => Boolean(row.is_completed)).length,
  };
}

/**
 * Compares the sets the user has entered with the sets of the previous
 * session of the same exercise.
 *
 * A blank input is not treated as a zero-weight set: a set that has no
 * weight yet is reported as `null` and is left out of the differences.
 */
export function compareSets(
  exerciseId: number,
  exerciseName: string,
  isDumbbell: boolean,
  previousSets: ComparisonSet[] | null,
  currentSets: ComparisonSet[],
): ExerciseComparison {
  const previousVolume = previousSets
    ? round2(
        previousSets
          .filter((set) => set.is_completed)
          .reduce(
            (sum, set) => sum + setVolume(set.weight_kg, set.reps, isDumbbell),
            0,
          ),
      )
    : null;

  const previousReps = previousSets
    ? previousSets.filter((set) => set.is_completed).reduce((sum, set) => sum + set.reps, 0)
    : null;

  const usableCurrent = currentSets.filter((set) => set.weight_kg > 0 && set.reps > 0);
  const currentVolume = round2(
    usableCurrent.reduce((sum, set) => sum + setVolume(set.weight_kg, set.reps, isDumbbell), 0),
  );
  const currentReps = usableCurrent.reduce((sum, set) => sum + set.reps, 0);

  const setNumbers = [
    ...new Set([
      ...(previousSets?.map((set) => set.set_number) ?? []),
      ...currentSets.map((set) => set.set_number),
    ]),
  ].sort((a, b) => a - b);

  const sets = setNumbers.map((setNumber) => {
    const before = previousSets?.find((set) => set.set_number === setNumber) ?? null;
    const now = currentSets.find((set) => set.set_number === setNumber) ?? null;

    const previousWeight = before && before.is_completed ? before.weight_kg : null;
    const previousRep = before && before.is_completed ? before.reps : null;
    const currentWeight = now && now.weight_kg > 0 ? now.weight_kg : null;
    const currentRep = now && now.reps > 0 ? now.reps : null;

    const weightDelta =
      previousWeight !== null && currentWeight !== null
        ? round2(currentWeight - previousWeight)
        : null;
    const repsDelta =
      previousRep !== null && currentRep !== null ? currentRep - previousRep : null;

    // The direction follows the weight when both values are known.
    let direction: 'up' | 'down' | 'flat' | 'none' = 'none';
    if (weightDelta !== null) {
      if (weightDelta > 0) direction = 'up';
      else if (weightDelta < 0) direction = 'down';
      else direction = 'flat';
    }

    return {
      set_number: setNumber,
      previous_weight: previousWeight,
      previous_reps: previousRep,
      current_weight: currentWeight,
      current_reps: currentRep,
      weight_delta: weightDelta,
      reps_delta: repsDelta,
      direction,
    };
  });

  const volumeDelta = previousVolume !== null ? round2(currentVolume - previousVolume) : null;
  const repsDelta = previousReps !== null ? currentReps - previousReps : null;

  let direction: ExerciseComparison['direction'] = 'none';
  if (volumeDelta !== null) {
    if (volumeDelta > 0) direction = 'up';
    else if (volumeDelta < 0) direction = 'down';
    else direction = 'flat';
  }

  return {
    exercise_id: exerciseId,
    exercise_name: exerciseName,
    is_dumbbell: isDumbbell,
    previous: previousSets
      ? {
          sets: previousSets,
          total_reps: previousReps ?? 0,
          total_volume: previousVolume ?? 0,
        }
      : null,
    current: {
      sets: currentSets,
      total_reps: currentReps,
      total_volume: currentVolume,
    },
    sets,
    volume_delta: volumeDelta,
    volume_percent:
      previousVolume !== null && previousVolume > 0 && volumeDelta !== null
        ? round2((volumeDelta / previousVolume) * 100)
        : null,
    reps_delta: repsDelta,
    direction,
  };
}

/**
 * Compares two saved sessions of the same day, so any two dates can be
 * put side by side.
 */
export async function compareSessions(
  sessionIdA: number,
  sessionIdB: number,
): Promise<SessionComparison> {
  const [a, b] = await Promise.all([readSessionSets(sessionIdA), readSessionSets(sessionIdB)]);

  const exercises: SessionComparison['exercises'] = [];

  const exerciseIds = [
    ...new Set([...a.exercises.map((item) => item.exercise_id), ...b.exercises.map((item) => item.exercise_id)]),
  ].sort((first, second) => {
    const nameA =
      a.exercises.find((item) => item.exercise_id === first)?.exercise_name ??
      b.exercises.find((item) => item.exercise_id === first)?.exercise_name ??
      '';
    const nameB =
      a.exercises.find((item) => item.exercise_id === second)?.exercise_name ??
      b.exercises.find((item) => item.exercise_id === second)?.exercise_name ??
      '';
    return nameA.localeCompare(nameB);
  });

  for (const exerciseId of exerciseIds) {
    const exerciseA = a.exercises.find((item) => item.exercise_id === exerciseId);
    const exerciseB = b.exercises.find((item) => item.exercise_id === exerciseId);
    const name = exerciseA?.exercise_name ?? exerciseB?.exercise_name ?? 'Exercise';

    const previousVolume = exerciseA?.total_volume ?? 0;
    const currentVolume = exerciseB?.total_volume ?? 0;
    const volumeDelta = round2(currentVolume - previousVolume);

    let direction: SessionComparison['exercises'][number]['direction'] = 'flat';
    if (volumeDelta > 0) direction = 'up';
    else if (volumeDelta < 0) direction = 'down';

    exercises.push({
      exercise_id: exerciseId,
      exercise_name: name,
      previous_volume: previousVolume,
      current_volume: currentVolume,
      volume_delta: volumeDelta,
      volume_percent:
        previousVolume > 0 ? round2((volumeDelta / previousVolume) * 100) : null,
      direction,
    });
  }

  const volumeDelta = round2(b.total_volume - a.total_volume);

  let direction: SessionComparison['direction'] = 'flat';
  if (volumeDelta > 0) direction = 'up';
  else if (volumeDelta < 0) direction = 'down';

  return {
    session_a: {
      session_id: sessionIdA,
      workout_date: a.workout_date,
      total_reps: a.total_reps,
      total_volume: a.total_volume,
      completed_sets: a.completed_sets,
      exercises: a.exercises.map((item) => ({
        exercise_id: item.exercise_id,
        exercise_name: item.exercise_name,
        sets: item.sets,
        total_reps: item.total_reps,
        total_volume: item.total_volume,
      })),
    },
    session_b: {
      session_id: sessionIdB,
      workout_date: b.workout_date,
      total_reps: b.total_reps,
      total_volume: b.total_volume,
      completed_sets: b.completed_sets,
      exercises: b.exercises.map((item) => ({
        exercise_id: item.exercise_id,
        exercise_name: item.exercise_name,
        sets: item.sets,
        total_reps: item.total_reps,
        total_volume: item.total_volume,
      })),
    },
    volume_delta: volumeDelta,
    volume_percent:
      a.total_volume > 0 ? round2((volumeDelta / a.total_volume) * 100) : null,
    reps_delta: b.total_reps - a.total_reps,
    direction,
    exercises,
  };
}
