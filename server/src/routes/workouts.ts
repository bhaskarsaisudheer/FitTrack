import { Router } from 'express';
import {
  createWorkoutHandler,
  deleteWorkoutHandler,
  getOpenWorkoutHandler,
  getWorkoutHandler,
  listWorkoutsHandler,
  updateWorkoutHandler,
} from '../controllers/workoutController.js';
import {
  createSetHandler,
  listSetsHandler,
  saveExerciseSetsHandler,
} from '../controllers/setController.js';
import { validate } from '../middleware/validate.js';
import {
  createSetSchema,
  createWorkoutSchema,
  idParamSchema,
  listWorkoutsQuerySchema,
  openWorkoutQuerySchema,
  saveExerciseSetsSchema,
  updateWorkoutSchema,
} from '../utils/schemas.js';

export const workoutsRouter = Router();

// `open` is registered before `/:id` so it is not captured as an id.
workoutsRouter.get('/open', validate(openWorkoutQuerySchema, 'query'), getOpenWorkoutHandler);
workoutsRouter.get('/', validate(listWorkoutsQuerySchema, 'query'), listWorkoutsHandler);
workoutsRouter.get('/:id', validate(idParamSchema, 'params'), getWorkoutHandler);
workoutsRouter.post('/', validate(createWorkoutSchema), createWorkoutHandler);
workoutsRouter.put(
  '/:id',
  validate(idParamSchema, 'params'),
  validate(updateWorkoutSchema),
  updateWorkoutHandler,
);
workoutsRouter.delete('/:id', validate(idParamSchema, 'params'), deleteWorkoutHandler);

// Sets nested under a session.
workoutsRouter.get('/:id/sets', validate(idParamSchema, 'params'), listSetsHandler);
workoutsRouter.post(
  '/:id/sets',
  validate(idParamSchema, 'params'),
  validate(createSetSchema),
  createSetHandler,
);

// Saves the three sets of one exercise in a single request.
workoutsRouter.put(
  '/:id/sets',
  validate(idParamSchema, 'params'),
  validate(saveExerciseSetsSchema),
  saveExerciseSetsHandler,
);
