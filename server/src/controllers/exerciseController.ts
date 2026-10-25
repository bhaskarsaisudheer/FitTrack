import type { Request, Response } from 'express';
import {
  countExerciseUses,
  createExercise,
  deleteExercise,
  getExercise,
  listExercises,
  updateExercise,
} from '../services/exerciseService.js';
import { ApiError } from '../middleware/errors.js';
import { validatedParams, validatedQuery } from '../middleware/validate.js';

export async function listExercisesHandler(req: Request, res: Response): Promise<void> {
  const options = validatedQuery<{ search?: string; muscle_group?: string }>(req);
  const exercises = await listExercises(options);
  res.json({ data: exercises, count: exercises.length });
}

export async function getExerciseHandler(req: Request, res: Response): Promise<void> {
  const { id } = validatedParams<{ id: number }>(req);
  const exercise = await getExercise(id);
  res.json({ data: exercise });
}

export async function createExerciseHandler(req: Request, res: Response): Promise<void> {
  const body = req.body as {
    name: string;
    muscle_group?: string | null;
    is_dumbbell?: boolean;
    default_sets?: number;
  };
  const exercise = await createExercise(
    body.name,
    body.muscle_group ?? null,
    body.is_dumbbell ?? false,
    body.default_sets ?? 3,
  );
  res.status(201).json({ data: exercise });
}

export async function updateExerciseHandler(req: Request, res: Response): Promise<void> {
  const { id } = validatedParams<{ id: number }>(req);
  const changes = req.body as {
    name?: string;
    muscle_group?: string | null;
    is_dumbbell?: boolean;
    default_sets?: number;
  };
  const exercise = await updateExercise(id, changes);
  res.json({ data: exercise });
}

export async function deleteExerciseHandler(req: Request, res: Response): Promise<void> {
  const { id } = validatedParams<{ id: number }>(req);

  // Sets reference exercises, so a delete would break workout history.
  const uses = await countExerciseUses(id);
  if (uses > 0) {
    throw new ApiError(
      409,
      `This exercise is used by ${uses} workout set${uses === 1 ? '' : 's'} and cannot be deleted. Remove those sets first.`,
      'in_use',
    );
  }

  await deleteExercise(id);
  res.status(204).send();
}
