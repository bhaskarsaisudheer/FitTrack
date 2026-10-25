import type { Request, Response } from 'express';
import {
  getAllPersonalRecords,
  getExerciseTracker,
  getWeeklyOverview,
} from '../services/trackerService.js';
import { validatedParams, validatedQuery } from '../middleware/validate.js';

export async function getTrackerHandler(req: Request, res: Response): Promise<void> {
  const { id } = validatedParams<{ id: number }>(req);
  const { from, to } = validatedQuery<{ from?: string; to?: string }>(req);
  const tracker = await getExerciseTracker(id, { from, to });
  res.json({ data: tracker });
}

export async function getRecordsHandler(_req: Request, res: Response): Promise<void> {
  const records = await getAllPersonalRecords();
  res.json({ data: records, count: records.length });
}

export async function getWeeklyHandler(_req: Request, res: Response): Promise<void> {
  const overview = await getWeeklyOverview();
  res.json({ data: overview });
}
