import type { Request, Response } from 'express';
import {
  getExerciseProgress,
  getPreviousPerformance,
  getProgressSummary,
} from '../services/progressService.js';
import { validatedParams } from '../middleware/validate.js';

export async function getExerciseProgressHandler(req: Request, res: Response): Promise<void> {
  const { id } = validatedParams<{ id: number }>(req);
  const progress = await getExerciseProgress(id);
  res.json({ data: progress });
}

export async function getProgressSummaryHandler(_req: Request, res: Response): Promise<void> {
  const summary = await getProgressSummary();
  res.json({ data: summary });
}

export async function getPreviousPerformanceHandler(req: Request, res: Response): Promise<void> {
  const { id } = validatedParams<{ id: number }>(req);
  const beforeDate = typeof req.query.before_date === 'string' ? req.query.before_date : undefined;
  const previous = await getPreviousPerformance(id, beforeDate);
  res.json({ data: previous });
}
