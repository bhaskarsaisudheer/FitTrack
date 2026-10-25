import { Router } from 'express';
import {
  createExerciseHandler,
  deleteExerciseHandler,
  getExerciseHandler,
  listExercisesHandler,
  updateExerciseHandler,
} from '../controllers/exerciseController.js';
import { validate } from '../middleware/validate.js';
import {
  createExerciseSchema,
  idParamSchema,
  listExercisesQuerySchema,
  updateExerciseSchema,
} from '../utils/schemas.js';

export const exercisesRouter = Router();

exercisesRouter.get('/', validate(listExercisesQuerySchema, 'query'), listExercisesHandler);
exercisesRouter.get('/:id', validate(idParamSchema, 'params'), getExerciseHandler);
exercisesRouter.post('/', validate(createExerciseSchema), createExerciseHandler);
exercisesRouter.put(
  '/:id',
  validate(idParamSchema, 'params'),
  validate(updateExerciseSchema),
  updateExerciseHandler,
);
exercisesRouter.delete('/:id', validate(idParamSchema, 'params'), deleteExerciseHandler);
