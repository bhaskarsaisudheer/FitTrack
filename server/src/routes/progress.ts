import { Router } from 'express';
import {
  getExerciseProgressHandler,
  getPreviousPerformanceHandler,
  getProgressSummaryHandler,
} from '../controllers/progressController.js';
import { validate } from '../middleware/validate.js';
import { idParamSchema } from '../utils/schemas.js';

export const progressRouter = Router();

// `summary` is registered before `/:exerciseId` so it is not captured as an id.
progressRouter.get('/summary', getProgressSummaryHandler);
progressRouter.get('/:id', validate(idParamSchema, 'params'), getExerciseProgressHandler);
progressRouter.get(
  '/:id/previous',
  validate(idParamSchema, 'params'),
  getPreviousPerformanceHandler,
);
