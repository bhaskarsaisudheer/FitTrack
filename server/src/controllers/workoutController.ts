import type { Request, Response } from 'express';
import {
  createSession,
  deleteSession,
  findOpenSession,
  getSessionDetail,
  listWorkouts,
  updateSession,
} from '../services/workoutService.js';
import { validatedParams, validatedQuery } from '../middleware/validate.js';

export async function listWorkoutsHandler(req: Request, res: Response): Promise<void> {
  const options = validatedQuery<{
    limit: number;
    offset: number;
    from?: string;
    to?: string;
  }>(req);
  const workouts = await listWorkouts(options);
  res.json({ data: workouts, count: workouts.length });
}

export async function getWorkoutHandler(req: Request, res: Response): Promise<void> {
  const { id } = validatedParams<{ id: number }>(req);
  const workout = await getSessionDetail(id);
  res.json({ data: workout });
}

export async function createWorkoutHandler(req: Request, res: Response): Promise<void> {
  const body = req.body as {
    workout_date: string;
    start_time?: string | null;
    duration_minutes?: number | null;
    notes?: string | null;
    status?: 'in_progress' | 'completed';
    title?: string | null;
  };
  const workout = await createSession(body);
  res.status(201).json({ data: workout });
}

export async function updateWorkoutHandler(req: Request, res: Response): Promise<void> {
  const { id } = validatedParams<{ id: number }>(req);
  const changes = req.body as {
    workout_date?: string;
    start_time?: string | null;
    duration_minutes?: number | null;
    notes?: string | null;
    status?: 'in_progress' | 'completed';
    title?: string | null;
  };
  const workout = await updateSession(id, changes);
  res.json({ data: workout });
}

export async function deleteWorkoutHandler(req: Request, res: Response): Promise<void> {
  const { id } = validatedParams<{ id: number }>(req);
  await deleteSession(id);
  res.status(204).send();
}

/**
 * Returns the unfinished session for a date, so the workout screen can
 * resume it instead of creating a second session for the same day.
 */
export async function getOpenWorkoutHandler(req: Request, res: Response): Promise<void> {
  const { date } = validatedQuery<{ date: string }>(req);
  const session = await findOpenSession(date);
  if (!session) {
    res.json({ data: null });
    return;
  }
  const detail = await getSessionDetail(session.id);
  res.json({ data: detail });
}
