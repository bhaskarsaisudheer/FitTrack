import type { Request, Response } from 'express';
import {
  getDayProgramme,
  getDayPreviousSession,
  getWeekProgramme,
  listDaySessions,
  setDayProgramme,
} from '../services/dayService.js';
import { compareSessions } from '../services/comparisonService.js';
import { validatedParams, validatedQuery } from '../middleware/validate.js';

/** The programme of one day, with the exercises it contains. */
export async function getDayHandler(req: Request, res: Response): Promise<void> {
  const { day } = validatedParams<{ day: number }>(req);
  const programme = await getDayProgramme(day);
  res.json({ data: programme });
}

/** The whole week, for the dashboard strip. */
export async function getWeekHandler(_req: Request, res: Response): Promise<void> {
  const week = await getWeekProgramme();
  res.json({ data: week });
}

/** The previous session of a day, with every set of every exercise. */
export async function getDayPreviousHandler(req: Request, res: Response): Promise<void> {
  const { day } = validatedParams<{ day: number }>(req);
  const { before_date } = validatedQuery<{ before_date?: string }>(req);
  const previous = await getDayPreviousSession(day, before_date);
  res.json({ data: previous });
}

/** Every saved session of a day, newest first. */
export async function getDaySessionsHandler(req: Request, res: Response): Promise<void> {
  const { day } = validatedParams<{ day: number }>(req);
  const sessions = await listDaySessions(day);
  res.json({ data: sessions, count: sessions.length });
}

/** Replaces the programme of a day. */
export async function setDayHandler(req: Request, res: Response): Promise<void> {
  const { day } = validatedParams<{ day: number }>(req);
  const { exercise_ids, title } = req.body as {
    exercise_ids: number[];
    title?: string;
  };
  const programme = await setDayProgramme(day, exercise_ids, title);
  res.json({ data: programme });
}

/** Compares two saved sessions side by side. */
export async function compareSessionsHandler(req: Request, res: Response): Promise<void> {
  const { a, b } = validatedQuery<{ a: string; b: string }>(req);
  const comparison = await compareSessions(Number(a), Number(b));
  res.json({ data: comparison });
}
