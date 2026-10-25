import type { RowDataPacket } from 'mysql2';
import type { PoolConnection } from 'mysql2/promise';
import { pool } from '../config/database.js';
import { execute, queryOne, queryRows, type QueryRunner } from '../config/query.js';
import { ApiError } from '../middleware/errors.js';
import type { WorkoutSet } from '../types/index.js';

type SetRow = RowDataPacket & WorkoutSet;

export interface SetInput {
  exercise_id: number;
  set_number?: number;
  weight_kg: number;
  reps: number;
  is_completed: boolean;
}

/** Confirms the parent session exists before writing sets against it. */
async function assertSessionExists(runner: QueryRunner, sessionId: number): Promise<void> {
  const row = await queryOne<RowDataPacket & { id: number }>(
    runner,
    'SELECT id FROM workout_sessions WHERE id = ?',
    [sessionId],
  );
  if (!row) throw ApiError.notFound('Workout session not found.');
}

/** Confirms the exercise exists before writing a set against it. */
async function assertExerciseExists(runner: QueryRunner, exerciseId: number): Promise<void> {
  const row = await queryOne<RowDataPacket & { id: number }>(
    runner,
    'SELECT id FROM exercises WHERE id = ?',
    [exerciseId],
  );
  if (!row) throw ApiError.notFound('Exercise not found.');
}

/**
 * Returns the workout exercise record for a session, creating it when it is
 * missing. Every set hangs off this record, which is what links an
 * exercise to a session.
 */
async function ensureWorkoutExercise(
  runner: QueryRunner,
  sessionId: number,
  exerciseId: number,
  position: number,
): Promise<number> {
  // A locking read is used instead of a plain SELECT so the lookup sees
  // the latest committed row. Under REPEATABLE READ a plain SELECT would
  // keep reading the snapshot taken at the start of the transaction, which
  // is why two overlapping saves could miss each other's row.
  const existing = await queryOne<RowDataPacket & { id: number }>(
    runner,
    `SELECT id FROM workout_exercises
     WHERE session_id = ? AND exercise_id = ?
     FOR UPDATE`,
    [sessionId, exerciseId],
  );
  if (existing) return existing.id;

  // INSERT IGNORE keeps two overlapping requests from failing on the
  // UNIQUE (session, exercise) key. The second one waits for the first to
  // commit and then finds the row that was already written.
  await execute(
    runner,
    `INSERT IGNORE INTO workout_exercises (session_id, exercise_id, position)
     VALUES (?, ?, ?)`,
    [sessionId, exerciseId, position],
  );

  const created = await queryOne<RowDataPacket & { id: number }>(
    runner,
    `SELECT id FROM workout_exercises
     WHERE session_id = ? AND exercise_id = ?
     FOR UPDATE`,
    [sessionId, exerciseId],
  );
  if (!created) throw ApiError.internal('Could not create the workout exercise.');
  return created.id;
}

/**
 * Renumbers sets for one exercise inside a session so numbers stay
 * contiguous (1, 2, 3 …) and never collide with the UNIQUE constraint.
 *
 * Two passes are used because MySQL cannot update a UNIQUE column to a value
 * another row already holds — the first pass parks the rows on negative
 * temporary numbers, the second moves them to their final positions.
 */
async function renumberSets(
  runner: QueryRunner,
  sessionId: number,
  exerciseId: number,
): Promise<void> {
  const rows = await queryRows<RowDataPacket & { id: number }>(
    runner,
    `SELECT id FROM workout_sets
     WHERE session_id = ? AND exercise_id = ?
     ORDER BY set_number ASC, id ASC`,
    [sessionId, exerciseId],
  );

  if (rows.length === 0) return;

  // Pass 1: park every set on a distinct negative number.
  for (const [index, row] of rows.entries()) {
    await execute(runner, 'UPDATE workout_sets SET set_number = ? WHERE id = ?', [
      -(index + 1),
      row.id,
    ]);
  }

  // Pass 2: assign the final contiguous numbers.
  for (const [index, row] of rows.entries()) {
    await execute(runner, 'UPDATE workout_sets SET set_number = ? WHERE id = ?', [
      index + 1,
      row.id,
    ]);
  }
}

export async function listSetsForSession(sessionId: number): Promise<WorkoutSet[]> {
  const rows = await queryRows<SetRow>(
    pool,
    `SELECT id, session_id, exercise_id, workout_exercise_id, set_number, weight_kg, reps,
            is_completed, completed_at
     FROM workout_sets
     WHERE session_id = ?
     ORDER BY exercise_id ASC, set_number ASC`,
    [sessionId],
  );
  return rows.map((row) => ({
    ...row,
    weight_kg: Number(row.weight_kg),
    is_completed: Boolean(row.is_completed),
  }));
}

export async function getSet(id: number): Promise<WorkoutSet> {
  const set = await queryOne<SetRow>(
    pool,
    `SELECT id, session_id, exercise_id, workout_exercise_id, set_number, weight_kg, reps,
            is_completed, completed_at
     FROM workout_sets WHERE id = ?`,
    [id],
  );
  if (!set) throw ApiError.notFound('Set not found.');
  return {
    ...set,
    weight_kg: Number(set.weight_kg),
    is_completed: Boolean(set.is_completed),
  };
}

/**
 * Adds a set to a session. When no set_number is supplied the set is
 * appended after the current last set for that exercise.
 */
export async function createSet(sessionId: number, input: SetInput): Promise<WorkoutSet> {
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();

    await assertSessionExists(connection, sessionId);
    await assertExerciseExists(connection, input.exercise_id);

    const workoutExerciseId = await ensureWorkoutExercise(
      connection,
      sessionId,
      input.exercise_id,
      input.set_number ?? 1,
    );

    const existing = await queryOne<RowDataPacket & { max_set: number | null }>(
      connection,
      `SELECT MAX(set_number) AS max_set
       FROM workout_sets
       WHERE session_id = ? AND exercise_id = ?`,
      [sessionId, input.exercise_id],
    );

    const nextNumber = input.set_number ?? ((existing?.max_set ?? 0) + 1);

    // Make room for the new set by shifting colliding sets up by one.
    await execute(
      connection,
      `UPDATE workout_sets
       SET set_number = set_number + 1
       WHERE session_id = ? AND exercise_id = ? AND set_number >= ?`,
      [sessionId, input.exercise_id, nextNumber],
    );

    const result = await execute(
      connection,
      `INSERT INTO workout_sets
         (session_id, exercise_id, workout_exercise_id, set_number, weight_kg, reps, is_completed)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [
        sessionId,
        input.exercise_id,
        workoutExerciseId,
        nextNumber,
        input.weight_kg,
        input.reps,
        input.is_completed,
      ],
    );

    await connection.commit();

    const created = await queryOne<SetRow>(
      connection,
      `SELECT id, session_id, exercise_id, workout_exercise_id, set_number, weight_kg, reps,
              is_completed, completed_at
       FROM workout_sets WHERE id = ?`,
      [result.insertId],
    );
    if (!created) throw ApiError.notFound('Set not found.');
    return {
      ...created,
      weight_kg: Number(created.weight_kg),
      is_completed: Boolean(created.is_completed),
    };
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}

/**
 * Runs a transaction and retries it when MySQL reports a deadlock or a
 * lock wait timeout.
 *
 * Two overlapping saves of the same exercise can briefly lock each other
 * out. InnoDB resolves that by killing one of them, and the standard
 * answer is to run the transaction again — the retry then finds the row
 * the first transaction committed and updates it.
 */
async function runTransaction<T>(
  work: (connection: PoolConnection) => Promise<T>,
  attempts = 3,
): Promise<T> {
  let lastError: unknown;

  for (let attempt = 0; attempt < attempts; attempt += 1) {
    const connection = await pool.getConnection();
    try {
      await connection.beginTransaction();
      const result = await work(connection);
      await connection.commit();
      return result;
    } catch (error) {
      await connection.rollback();
      lastError = error;

      const message = error instanceof Error ? error.message : String(error);
      const isRetryable =
        message.includes('Deadlock found') || message.includes('Lock wait timeout');

      if (!isRetryable || attempt === attempts - 1) throw error;

      // A short, growing pause keeps the retry from colliding again.
      await new Promise((resolve) => setTimeout(resolve, 25 * (attempt + 1)));
    } finally {
      connection.release();
    }
  }

  throw lastError;
}

/**
 * Writes the three sets of one exercise in a single transaction. Sets that
 * already exist are updated, missing ones are created and any extra ones
 * are removed, so the exercise always ends up with exactly three sets.
 *
 * This is what the workout screen calls when the user saves an exercise, so
 * a reload always shows the same three rows.
 */
export async function saveExerciseSets(
  sessionId: number,
  exerciseId: number,
  sets: Array<{ set_number: number; weight_kg: number; reps: number; is_completed: boolean }>,
): Promise<WorkoutSet[]> {
  return runTransaction(async (connection) => {
    await assertSessionExists(connection, sessionId);
    await assertExerciseExists(connection, exerciseId);

    const workoutExerciseId = await ensureWorkoutExercise(
      connection,
      sessionId,
      exerciseId,
      sets[0]?.set_number ?? 1,
    );

    const existing = await queryRows<RowDataPacket & { id: number; set_number: number }>(
      connection,
      `SELECT id, set_number FROM workout_sets
       WHERE session_id = ? AND exercise_id = ?
       ORDER BY set_number ASC
       FOR UPDATE`,
      [sessionId, exerciseId],
    );

    const existingByNumber = new Map(existing.map((row) => [row.set_number, row.id]));
    const keepIds = new Set<number>();

    for (const set of sets) {
      const currentId = existingByNumber.get(set.set_number);

      if (currentId !== undefined) {
        keepIds.add(currentId);
        await execute(
          connection,
          `UPDATE workout_sets
           SET weight_kg = ?, reps = ?, is_completed = ?,
               completed_at = CASE WHEN ? = TRUE THEN COALESCE(completed_at, CURRENT_TIMESTAMP)
                                  ELSE NULL END,
               workout_exercise_id = ?
           WHERE id = ?`,
          [
            set.weight_kg,
            set.reps,
            set.is_completed,
            set.is_completed,
            workoutExerciseId,
            currentId,
          ],
        );
        continue;
      }

      // The write uses INSERT … ON DUPLICATE KEY UPDATE so two saves that
      // overlap cannot collide on the UNIQUE (session, exercise, set)
      // key. The second one simply updates the row the first one wrote.
      const result = await execute(
        connection,
        `INSERT INTO workout_sets
           (session_id, exercise_id, workout_exercise_id, set_number, weight_kg, reps,
            is_completed, completed_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, CASE WHEN ? = TRUE THEN CURRENT_TIMESTAMP ELSE NULL END)
         ON DUPLICATE KEY UPDATE
           weight_kg = VALUES(weight_kg),
           reps = VALUES(reps),
           is_completed = VALUES(is_completed),
           completed_at = CASE WHEN VALUES(is_completed) = TRUE
                               THEN COALESCE(completed_at, CURRENT_TIMESTAMP)
                               ELSE NULL END,
           workout_exercise_id = VALUES(workout_exercise_id)`,
        [
          sessionId,
          exerciseId,
          workoutExerciseId,
          set.set_number,
          set.weight_kg,
          set.reps,
          set.is_completed,
          set.is_completed,
        ],
      );

      // With ON DUPLICATE KEY UPDATE the insert id is 0 when the row was
      // updated instead, so the id is read back from the row itself.
      const saved = await queryOne<RowDataPacket & { id: number }>(
        connection,
        `SELECT id FROM workout_sets
         WHERE session_id = ? AND exercise_id = ? AND set_number = ?
         FOR UPDATE`,
        [sessionId, exerciseId, set.set_number],
      );
      if (saved) keepIds.add(saved.id);
      else if (result.insertId) keepIds.add(result.insertId);
    }

    // Remove any set that is no longer part of the exercise.
    for (const row of existing) {
      if (!keepIds.has(row.id)) {
        await execute(connection, 'DELETE FROM workout_sets WHERE id = ?', [row.id]);
      }
    }

    const saved = await queryRows<SetRow>(
      connection,
      `SELECT id, session_id, exercise_id, workout_exercise_id, set_number, weight_kg, reps,
              is_completed, completed_at
       FROM workout_sets
       WHERE session_id = ? AND exercise_id = ?
       ORDER BY set_number ASC`,
      [sessionId, exerciseId],
    );

    return saved.map((row) => ({
      ...row,
      weight_kg: Number(row.weight_kg),
      is_completed: Boolean(row.is_completed),
    }));
  });
}

export async function updateSet(
  id: number,
  changes: {
    exercise_id?: number;
    set_number?: number;
    weight_kg?: number;
    reps?: number;
    is_completed?: boolean;
  },
): Promise<WorkoutSet> {
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();

    const current = await getSet(id);
    const targetExerciseId = changes.exercise_id ?? current.exercise_id;

    if (changes.exercise_id !== undefined) {
      await assertExerciseExists(connection, changes.exercise_id);
    }

    const fields: string[] = [];
    const params: (number | boolean)[] = [];

    if (changes.exercise_id !== undefined) {
      fields.push('exercise_id = ?');
      params.push(changes.exercise_id);
    }
    if (changes.weight_kg !== undefined) {
      fields.push('weight_kg = ?');
      params.push(changes.weight_kg);
    }
    if (changes.reps !== undefined) {
      fields.push('reps = ?');
      params.push(changes.reps);
    }
    if (changes.is_completed !== undefined) {
      fields.push('is_completed = ?');
      params.push(changes.is_completed);
      // Stamp the completion time the first time a set is ticked off, and
      // clear it again when the tick is removed.
      fields.push(
        'completed_at = CASE WHEN ? = TRUE THEN COALESCE(completed_at, CURRENT_TIMESTAMP) ELSE NULL END',
      );
      params.push(changes.is_completed);
    }

    if (fields.length === 0 && changes.set_number === undefined) {
      throw ApiError.badRequest('Provide at least one field to update.');
    }

    // Moving a set to a new position frees its old slot first, so the UNIQUE
    // constraint cannot be violated mid-update.
    if (changes.set_number !== undefined) {
      await execute(connection, 'UPDATE workout_sets SET set_number = -1 WHERE id = ?', [id]);
      fields.push('set_number = ?');
      params.push(changes.set_number);

      // Push the sets occupying the target position down by one.
      await execute(
        connection,
        `UPDATE workout_sets
         SET set_number = set_number + 1
         WHERE session_id = ? AND exercise_id = ? AND set_number >= ? AND id <> ?`,
        [current.session_id, targetExerciseId, changes.set_number, id],
      );
    }

    if (fields.length > 0) {
      params.push(id);
      await execute(
        connection,
        `UPDATE workout_sets SET ${fields.join(', ')} WHERE id = ?`,
        params,
      );
    }

    await renumberSets(connection, current.session_id, current.exercise_id);
    if (targetExerciseId !== current.exercise_id) {
      await renumberSets(connection, current.session_id, targetExerciseId);
    }

    await connection.commit();

    const updated = await queryOne<SetRow>(
      connection,
      `SELECT id, session_id, exercise_id, workout_exercise_id, set_number, weight_kg, reps,
              is_completed, completed_at
       FROM workout_sets WHERE id = ?`,
      [id],
    );
    if (!updated) throw ApiError.notFound('Set not found.');
    return {
      ...updated,
      weight_kg: Number(updated.weight_kg),
      is_completed: Boolean(updated.is_completed),
    };
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}

/** Deletes a set and closes the gap in the remaining set numbers. */
export async function deleteSet(id: number): Promise<void> {
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();

    const current = await getSet(id);

    await execute(connection, 'DELETE FROM workout_sets WHERE id = ?', [id]);
    await renumberSets(connection, current.session_id, current.exercise_id);

    await connection.commit();
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}

/**
 * Removes every set of one exercise from a session. Used when an exercise
 * is taken out of a workout.
 */
export async function deleteExerciseSets(sessionId: number, exerciseId: number): Promise<void> {
  await execute(
    pool,
    'DELETE FROM workout_sets WHERE session_id = ? AND exercise_id = ?',
    [sessionId, exerciseId],
  );
  await execute(
    pool,
    'DELETE FROM workout_exercises WHERE session_id = ? AND exercise_id = ?',
    [sessionId, exerciseId],
  );
}
