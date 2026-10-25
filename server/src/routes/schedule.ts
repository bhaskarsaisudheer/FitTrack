import { Router } from 'express';
import {
  getDayScheduleHandler,
  getWeeklyScheduleHandler,
  setDayScheduleHandler,
} from '../controllers/scheduleController.js';
import { validate } from '../middleware/validate.js';
import { dayParamSchema, setDayScheduleSchema } from '../utils/schemas.js';

export const scheduleRouter = Router();

scheduleRouter.get('/', getWeeklyScheduleHandler);
scheduleRouter.get('/:day', validate(dayParamSchema, 'params'), getDayScheduleHandler);
scheduleRouter.put(
  '/:day',
  validate(dayParamSchema, 'params'),
  validate(setDayScheduleSchema),
  setDayScheduleHandler,
);
