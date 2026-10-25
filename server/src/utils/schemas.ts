import { z } from 'zod';

/** Weight in kilograms: 0 up to 9999.99, up to 2 decimals. */
export const weightKgSchema = z.coerce
  .number({ message: 'Weight must be a number.' })
  .min(0, 'Weight cannot be negative.')
  .max(9999.99, 'Weight is too large.');

/** Repetitions: whole numbers only, 0 up to 1000. */
export const repsSchema = z.coerce
  .number({ message: 'Reps must be a number.' })
  .int('Reps must be a whole number.')
  .min(0, 'Reps cannot be negative.')
  .max(1000, 'Reps look unrealistically high.');

/** `YYYY-MM-DD` — validated as a real calendar date. */
export const dateSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'Date must use the YYYY-MM-DD format.')
  .refine((value) => {
    const parsed = new Date(`${value}T00:00:00Z`);
    return !Number.isNaN(parsed.getTime()) && parsed.toISOString().startsWith(value);
  }, 'Date is not a valid calendar date.');

/** `YYYY-MM-DDTHH:mm` or `YYYY-MM-DDTHH:mm:ss` (also accepts a space separator). */
export const dateTimeSchema = z
  .string()
  .regex(
    /^\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}(:\d{2})?$/,
    'Start time must use the YYYY-MM-DDTHH:mm format.',
  )
  .refine((value) => !Number.isNaN(new Date(value.replace(' ', 'T')).getTime()), {
    message: 'Start time is not a valid date and time.',
  });

export const exerciseNameSchema = z
  .string()
  .trim()
  .min(1, 'Exercise name is required.')
  .max(100, 'Exercise name must be 100 characters or fewer.');

export const muscleGroupSchema = z
  .string()
  .trim()
  .max(50, 'Muscle group must be 50 characters or fewer.')
  .nullable()
  .optional();

export const idParamSchema = z.object({
  id: z.coerce.number().int().positive(),
});

/** Day of the week: 1 = Monday … 7 = Sunday. */
export const dayParamSchema = z.object({
  day: z.coerce.number().int().min(1).max(7),
});

/** The exercises of one day, in the order they should be performed. */
export const setDayScheduleSchema = z.object({
  exercise_ids: z.array(z.coerce.number().int().positive()).max(30),
});

/** Replaces the programme of one day, optionally renaming the day. */
export const setDayProgrammeSchema = z.object({
  exercise_ids: z.array(z.coerce.number().int().positive()).max(30),
  title: z.string().max(60).optional(),
});

/** The previous session of a day, optionally before a given date. */
export const dayPreviousQuerySchema = z.object({
  before_date: dateSchema.optional(),
});

/** Compares two saved sessions. */
export const compareSessionsQuerySchema = z.object({
  a: z.coerce.number().int().positive(),
  b: z.coerce.number().int().positive(),
});

/** Optional date range for the progress tracker. */
export const trackerRangeQuerySchema = z.object({
  from: dateSchema.optional(),
  to: dateSchema.optional(),
});

export const createExerciseSchema = z.object({
  name: exerciseNameSchema,
  muscle_group: muscleGroupSchema,
  is_dumbbell: z.coerce.boolean().default(false),
  default_sets: z.coerce.number().int().min(1).max(10).default(3),
});

export const updateExerciseSchema = z
  .object({
    name: exerciseNameSchema.optional(),
    muscle_group: muscleGroupSchema,
    is_dumbbell: z.coerce.boolean().optional(),
    default_sets: z.coerce.number().int().min(1).max(10).optional(),
  })
  .refine(
    (data) =>
      data.name !== undefined ||
      data.muscle_group !== undefined ||
      data.is_dumbbell !== undefined ||
      data.default_sets !== undefined,
    { message: 'Provide at least one field to update.' },
  );

export const createWorkoutSchema = z.object({
  workout_date: dateSchema,
  day_of_week: z.coerce.number().int().min(1).max(7).optional(),
  start_time: dateTimeSchema.nullable().optional(),
  duration_minutes: z.coerce
    .number()
    .int()
    .min(0)
    .max(24 * 60)
    .nullable()
    .optional(),
  notes: z.string().max(5000).nullable().optional(),
  status: z.enum(['in_progress', 'completed']).optional(),
  title: z.string().max(100).nullable().optional(),
});

export const updateWorkoutSchema = z
  .object({
    workout_date: dateSchema.optional(),
    day_of_week: z.coerce.number().int().min(1).max(7).optional(),
    start_time: dateTimeSchema.nullable().optional(),
    duration_minutes: z.coerce.number().int().min(0).max(24 * 60).nullable().optional(),
    notes: z.string().max(5000).nullable().optional(),
    status: z.enum(['in_progress', 'completed']).optional(),
    title: z.string().max(100).nullable().optional(),
  })
  .refine(
    (data) =>
      data.workout_date !== undefined ||
      data.day_of_week !== undefined ||
      data.start_time !== undefined ||
      data.duration_minutes !== undefined ||
      data.notes !== undefined ||
      data.status !== undefined ||
      data.title !== undefined,
    { message: 'Provide at least one field to update.' },
  );

export const createSetSchema = z.object({
  exercise_id: z.coerce.number().int().positive(),
  set_number: z.coerce.number().int().min(1).optional(),
  weight_kg: weightKgSchema.default(0),
  reps: repsSchema.default(0),
  is_completed: z.coerce.boolean().default(false),
});

/** The three sets of one exercise, saved together. */
export const saveExerciseSetsSchema = z.object({
  exercise_id: z.coerce.number().int().positive(),
  sets: z
    .array(
      z.object({
        set_number: z.coerce.number().int().min(1),
        weight_kg: weightKgSchema,
        reps: repsSchema,
        is_completed: z.coerce.boolean(),
      }),
    )
    .min(1)
    .max(10),
});

export const updateSetSchema = z
  .object({
    exercise_id: z.coerce.number().int().positive().optional(),
    set_number: z.coerce.number().int().min(1).optional(),
    weight_kg: weightKgSchema.optional(),
    reps: repsSchema.optional(),
    is_completed: z.coerce.boolean().optional(),
  })
  .refine(
    (data) =>
      data.exercise_id !== undefined ||
      data.set_number !== undefined ||
      data.weight_kg !== undefined ||
      data.reps !== undefined ||
      data.is_completed !== undefined,
    { message: 'Provide at least one field to update.' },
  );

/** Looks up the unfinished session of one date. */
export const openWorkoutQuerySchema = z.object({
  date: dateSchema,
});

export const listWorkoutsQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(200).default(50),
  offset: z.coerce.number().int().min(0).default(0),
  from: dateSchema.optional(),
  to: dateSchema.optional(),
});

export const listExercisesQuerySchema = z.object({
  search: z.string().trim().max(100).optional(),
  muscle_group: z.string().trim().max(50).optional(),
});
