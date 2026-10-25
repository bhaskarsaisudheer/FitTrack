import type { Request, Response } from 'express';
import {
  getScheduleForDay,
  getWeeklySchedule,
  setScheduleForDay,
} from '../services/scheduleService.js';
import { validatedParams, validatedQuery } from '../middleware/validate.js';

export async function getWeeklyScheduleHandler(_req: Request, res: Response): Promise<void> {
  const schedule = await getWeeklySchedule();
  res.json({ data: schedule });
}

export async function getDayScheduleHandler(req: Request, res: Response): Promise<void> {
  const { day } = validatedParams<{ day: number }>(req);
  const entries = await getScheduleForDay(day);
  res.json({ data: entries, count: entries.length });
}

export async function setDayScheduleHandler(req: Request, res: Response): Promise<void> {
  const { day } = validatedParams<{ day: number }>(req);
  const { exercise_ids } = req.body as { exercise_ids: number[] };
  const entries = await setScheduleForDay(day, exercise_ids);
  res.json({ data: entries, count: entries.length });
}
