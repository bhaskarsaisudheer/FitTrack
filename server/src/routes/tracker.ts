import { Router } from 'express';
import {
  getRecordsHandler,
  getTrackerHandler,
  getWeeklyHandler,
} from '../controllers/trackerController.js';
import { validate } from '../middleware/validate.js';
import { idParamSchema, trackerRangeQuerySchema } from '../utils/schemas.js';

export const trackerRouter = Router();

// `records` and `weekly` are registered before `/:exerciseId` so they are
// not captured as an exercise id.
trackerRouter.get('/records', getRecordsHandler);
trackerRouter.get('/weekly', getWeeklyHandler);
trackerRouter.get(
  '/:id',
  validate(idParamSchema, 'params'),
  validate(trackerRangeQuerySchema, 'query'),
  getTrackerHandler,
);
