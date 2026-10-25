import { Router } from 'express';
import {
  compareSessionsHandler,
  getDayHandler,
  getDayPreviousHandler,
  getDaySessionsHandler,
  getWeekHandler,
  setDayHandler,
} from '../controllers/dayController.js';
import { validate } from '../middleware/validate.js';
import {
  compareSessionsQuerySchema,
  dayParamSchema,
  dayPreviousQuerySchema,
  setDayProgrammeSchema,
} from '../utils/schemas.js';

export const dayRouter = Router();

// The fixed paths are registered before `/:day`, so they are never
// mistaken for a day number.
dayRouter.get('/week', getWeekHandler);
dayRouter.get('/compare', validate(compareSessionsQuerySchema, 'query'), compareSessionsHandler);

dayRouter.get(
  '/:day/previous',
  validate(dayParamSchema, 'params'),
  validate(dayPreviousQuerySchema, 'query'),
  getDayPreviousHandler,
);
dayRouter.get('/:day/sessions', validate(dayParamSchema, 'params'), getDaySessionsHandler);
dayRouter.put(
  '/:day',
  validate(dayParamSchema, 'params'),
  validate(setDayProgrammeSchema),
  setDayHandler,
);
dayRouter.get('/:day', validate(dayParamSchema, 'params'), getDayHandler);
