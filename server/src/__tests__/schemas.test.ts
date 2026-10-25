import { describe, expect, it } from 'vitest';
import {
  createExerciseSchema,
  createSetSchema,
  createWorkoutSchema,
  dateSchema,
  dateTimeSchema,
  updateExerciseSchema,
  updateSetSchema,
  updateWorkoutSchema,
  weightKgSchema,
} from '../utils/schemas.js';

describe('weightKgSchema', () => {
  it('accepts zero and positive weights', () => {
    expect(weightKgSchema.parse(0)).toBe(0);
    expect(weightKgSchema.parse(60)).toBe(60);
    expect(weightKgSchema.parse(22.5)).toBe(22.5);
  });

  it('coerces numeric strings', () => {
    expect(weightKgSchema.parse('60')).toBe(60);
    expect(weightKgSchema.parse('22.5')).toBe(22.5);
  });

  it('rejects negative weights', () => {
    expect(weightKgSchema.safeParse(-1).success).toBe(false);
  });

  it('rejects weights above the maximum', () => {
    expect(weightKgSchema.safeParse(10000).success).toBe(false);
  });

  it('rejects non-numeric values', () => {
    expect(weightKgSchema.safeParse('heavy').success).toBe(false);
  });
});

describe('reps validation', () => {
  it('requires whole numbers', () => {
    const result = createSetSchema.safeParse({ exercise_id: 1, reps: 10.5 });
    expect(result.success).toBe(false);
  });

  it('rejects negative reps', () => {
    const result = createSetSchema.safeParse({ exercise_id: 1, reps: -3 });
    expect(result.success).toBe(false);
  });

  it('defaults weight, reps and completion state', () => {
    const parsed = createSetSchema.parse({ exercise_id: 1 });
    expect(parsed.weight_kg).toBe(0);
    expect(parsed.reps).toBe(0);
    expect(parsed.is_completed).toBe(false);
  });
});

describe('dateSchema', () => {
  it('accepts a valid ISO date', () => {
    expect(dateSchema.parse('2026-03-15')).toBe('2026-03-15');
  });

  it('rejects a malformed date', () => {
    expect(dateSchema.safeParse('15-03-2026').success).toBe(false);
  });

  it('rejects a date that does not exist', () => {
    expect(dateSchema.safeParse('2026-02-30').success).toBe(false);
  });

  it('rejects a date with the wrong shape', () => {
    expect(dateSchema.safeParse('2026-3-5').success).toBe(false);
  });
});

describe('dateTimeSchema', () => {
  it('accepts minutes and seconds precision', () => {
    expect(dateTimeSchema.parse('2026-03-15T09:30')).toBe('2026-03-15T09:30');
    expect(dateTimeSchema.parse('2026-03-15T09:30:15')).toBe('2026-03-15T09:30:15');
  });

  it('accepts a space separator', () => {
    expect(dateTimeSchema.parse('2026-03-15 09:30')).toBe('2026-03-15 09:30');
  });

  it('rejects a date without a time', () => {
    expect(dateTimeSchema.safeParse('2026-03-15').success).toBe(false);
  });
});

describe('createExerciseSchema', () => {
  it('trims the name and keeps the muscle group', () => {
    const parsed = createExerciseSchema.parse({ name: '  Bench Press ', muscle_group: 'Chest' });
    expect(parsed.name).toBe('Bench Press');
    expect(parsed.muscle_group).toBe('Chest');
  });

  it('rejects an empty name', () => {
    expect(createExerciseSchema.safeParse({ name: '   ' }).success).toBe(false);
  });

  it('allows a missing muscle group', () => {
    expect(createExerciseSchema.safeParse({ name: 'Bench Press' }).success).toBe(true);
  });
});

describe('updateExerciseSchema', () => {
  it('requires at least one field', () => {
    expect(updateExerciseSchema.safeParse({}).success).toBe(false);
  });

  it('allows clearing the muscle group', () => {
    expect(updateExerciseSchema.safeParse({ muscle_group: null }).success).toBe(true);
  });
});

describe('updateWorkoutSchema', () => {
  it('requires at least one field', () => {
    expect(updateWorkoutSchema.safeParse({}).success).toBe(false);
  });

  it('allows clearing the notes', () => {
    expect(updateWorkoutSchema.safeParse({ notes: null }).success).toBe(true);
  });
});

describe('updateSetSchema', () => {
  it('requires at least one field', () => {
    expect(updateSetSchema.safeParse({}).success).toBe(false);
  });

  it('accepts a completion toggle', () => {
    const parsed = updateSetSchema.parse({ is_completed: 'true' });
    expect(parsed.is_completed).toBe(true);
  });
});

describe('createWorkoutSchema', () => {
  it('rejects a duration longer than a day', () => {
    expect(createWorkoutSchema.safeParse({ workout_date: '2026-03-15', duration_minutes: 5000 }).success).toBe(
      false,
    );
  });

  it('accepts a valid session', () => {
    expect(
      createWorkoutSchema.safeParse({
        workout_date: '2026-03-15',
        start_time: '2026-03-15T09:30',
        duration_minutes: 45,
      }).success,
    ).toBe(true);
  });
});
