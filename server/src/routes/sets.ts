import { Router } from 'express';
import {
  deleteSetHandler,
  getSetHandler,
  updateSetHandler,
} from '../controllers/setController.js';
import { validate } from '../middleware/validate.js';
import { idParamSchema, updateSetSchema } from '../utils/schemas.js';

export const setsRouter = Router();

setsRouter.get('/:id', validate(idParamSchema, 'params'), getSetHandler);
setsRouter.put(
  '/:id',
  validate(idParamSchema, 'params'),
  validate(updateSetSchema),
  updateSetHandler,
);
setsRouter.delete('/:id', validate(idParamSchema, 'params'), deleteSetHandler);
