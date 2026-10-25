import type { Request, Response } from 'express';
import {
  createSet,
  deleteExerciseSets,
  deleteSet,
  getSet,
  listSetsForSession,
  saveExerciseSets,
  updateSet,
} from '../services/setService.js';
import { validatedParams } from '../middleware/validate.js';

export async function listSetsHandler(req: Request, res: Response): Promise<void> {
  const { id } = validatedParams<{ id: number }>(req);
  const sets = await listSetsForSession(id);
  res.json({ data: sets, count: sets.length });
}

export async function getSetHandler(req: Request, res: Response): Promise<void> {
  const { id } = validatedParams<{ id: number }>(req);
  const set = await getSet(id);
  res.json({ data: set });
}

export async function createSetHandler(req: Request, res: Response): Promise<void> {
  const { id } = validatedParams<{ id: number }>(req);
  const body = req.body as {
    exercise_id: number;
    set_number?: number;
    weight_kg: number;
    reps: number;
    is_completed: boolean;
  };
  const set = await createSet(id, body);
  res.status(201).json({ data: set });
}

export async function saveExerciseSetsHandler(req: Request, res: Response): Promise<void> {
  const { id } = validatedParams<{ id: number }>(req);
  const body = req.body as {
    exercise_id: number;
    sets: Array<{
      set_number: number;
      weight_kg: number;
      reps: number;
      is_completed: boolean;
    }>;
  };
  const sets = await saveExerciseSets(id, body.exercise_id, body.sets);
  res.json({ data: sets, count: sets.length });
}

export async function updateSetHandler(req: Request, res: Response): Promise<void> {
  const { id } = validatedParams<{ id: number }>(req);
  const changes = req.body as {
    exercise_id?: number;
    set_number?: number;
    weight_kg?: number;
    reps?: number;
    is_completed?: boolean;
  };
  const set = await updateSet(id, changes);
  res.json({ data: set });
}

export async function deleteSetHandler(req: Request, res: Response): Promise<void> {
  const { id } = validatedParams<{ id: number }>(req);
  await deleteSet(id);
  res.status(204).send();
}

export async function deleteExerciseSetsHandler(req: Request, res: Response): Promise<void> {
  const { id } = validatedParams<{ id: number }>(req);
  const { exercise_id } = req.body as { exercise_id: number };
  await deleteExerciseSets(id, exercise_id);
  res.status(204).send();
}
