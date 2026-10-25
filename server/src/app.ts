import cors from 'cors';
import express, { type Express } from 'express';
import { config } from './config/env.js';
import { checkDatabaseConnection } from './config/database.js';
import { errorHandler, notFoundHandler } from './middleware/errorHandler.js';
import { dayRouter } from './routes/day.js';
import { exercisesRouter } from './routes/exercises.js';
import { progressRouter } from './routes/progress.js';
import { scheduleRouter } from './routes/schedule.js';
import { setsRouter } from './routes/sets.js';
import { trackerRouter } from './routes/tracker.js';
import { workoutsRouter } from './routes/workouts.js';

export function createApp(): Express {
  const app = express();

  app.use(
    cors({
      origin: config.corsOrigin,
      credentials: false,
      methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    }),
  );

  app.use(express.json({ limit: '1mb' }));

  // Health check — also reports whether the database is reachable.
  app.get('/api/health', async (_req, res) => {
    try {
      await checkDatabaseConnection();
      res.json({
        status: 'ok',
        database: 'connected',
        uptime_seconds: Math.round(process.uptime()),
      });
    } catch (error) {
      console.error('[fittrack] Health check failed:', error);
      res.status(503).json({
        status: 'degraded',
        database: 'unreachable',
        message: 'The database is not reachable right now.',
      });
    }
  });

  app.use('/api/exercises', exercisesRouter);
  app.use('/api/workouts', workoutsRouter);
  app.use('/api/sets', setsRouter);
  app.use('/api/progress', progressRouter);
  app.use('/api/tracker', trackerRouter);
  app.use('/api/schedule', scheduleRouter);
  app.use('/api/days', dayRouter);

  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}
