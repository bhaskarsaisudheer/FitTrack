import type { Express } from 'express';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createApp } from '../app.js';
import { closeDatabase } from '../config/database.js';

/**
 * End-to-end API tests.
 *
 * These run against the real MySQL instance used in development. Every record
 * created here is removed again in `afterAll`, so the test data never leaks
 * into the app.
 *
 * The API wraps every successful response in a `{ data, count }` envelope,
 * which is unwrapped by the client — the tests assert against that contract.
 */

const app: Express = createApp();

// Unique per run so repeated runs never collide on the unique name index.
const stamp = Date.now().toString(36);
const exerciseName = `Test Exercise ${stamp}`;
// A muscle group unique to this run, so the filter test is not affected by
// rows left behind by an earlier run.
const muscleGroup = `Group ${stamp}`;

let exerciseId = 0;
let sessionId = 0;

beforeAll(async () => {
  const response = await request(app)
    .post('/api/exercises')
    .send({ name: exerciseName, muscle_group: muscleGroup })
    .expect(201);
  exerciseId = response.body.data.id as number;
});

afterAll(async () => {
  // Removing the session cascades to its sets; the exercise is removed
  // separately once it is no longer referenced.
  if (sessionId) {
    await request(app).delete(`/api/workouts/${sessionId}`);
  }
  if (exerciseId) {
    await request(app).delete(`/api/exercises/${exerciseId}`);
  }
  await closeDatabase();
});

describe('health', () => {
  it('reports a healthy database', async () => {
    const response = await request(app).get('/api/health').expect(200);
    expect(response.body.status).toBe('ok');
    expect(response.body.database).toBe('connected');
  });
});

describe('exercises', () => {
  it('creates an exercise', async () => {
    const response = await request(app)
      .post('/api/exercises')
      .send({ name: `Second Exercise ${stamp}`, muscle_group: 'Back' })
      .expect(201);

    expect(response.body.data).toMatchObject({
      name: `Second Exercise ${stamp}`,
      muscle_group: 'Back',
    });
    expect(typeof response.body.data.id).toBe('number');

    await request(app).delete(`/api/exercises/${response.body.data.id}`).expect(204);
  });

  it('rejects an exercise without a name', async () => {
    const response = await request(app).post('/api/exercises').send({ muscle_group: 'Chest' });
    expect(response.status).toBe(400);
    expect(response.body.error).toBeDefined();
  });

  it('lists the seeded exercises', async () => {
    const response = await request(app).get('/api/exercises').expect(200);
    expect(Array.isArray(response.body.data)).toBe(true);
    expect(response.body.data.length).toBeGreaterThan(0);
    expect(response.body.count).toBe(response.body.data.length);
  });

  it('filters exercises by search term', async () => {
    const response = await request(app)
      .get(`/api/exercises?search=${encodeURIComponent(exerciseName)}`)
      .expect(200);

    expect(response.body.data).toHaveLength(1);
    expect(response.body.data[0].id).toBe(exerciseId);
  });

  it('filters exercises by muscle group', async () => {
    const response = await request(app)
      .get(`/api/exercises?muscle_group=${encodeURIComponent(muscleGroup)}`)
      .expect(200);
    expect(response.body.data).toHaveLength(1);
    expect(response.body.data[0].id).toBe(exerciseId);
  });

  it('fetches a single exercise', async () => {
    const response = await request(app).get(`/api/exercises/${exerciseId}`).expect(200);
    expect(response.body.data.id).toBe(exerciseId);
    expect(response.body.data.name).toBe(exerciseName);
  });

  it('returns 404 for a missing exercise', async () => {
    await request(app).get('/api/exercises/999999999').expect(404);
  });

  it('rejects a non-numeric id', async () => {
    await request(app).get('/api/exercises/not-a-number').expect(400);
  });

  it('updates an exercise', async () => {
    const response = await request(app)
      .put(`/api/exercises/${exerciseId}`)
      .send({ name: `${exerciseName} Updated`, muscle_group: 'Legs' })
      .expect(200);

    expect(response.body.data.name).toBe(`${exerciseName} Updated`);
    expect(response.body.data.muscle_group).toBe('Legs');

    // Restore the original values for the remaining tests.
    await request(app)
      .put(`/api/exercises/${exerciseId}`)
      .send({ name: exerciseName, muscle_group: muscleGroup })
      .expect(200);
  });

  it('rejects an update with no fields', async () => {
    await request(app).put(`/api/exercises/${exerciseId}`).send({}).expect(400);
  });
});

describe('workouts', () => {
  it('creates a workout session', async () => {
    const response = await request(app)
      .post('/api/workouts')
      .send({ workout_date: '2026-01-15', start_time: '2026-01-15T09:00', notes: 'Test session' })
      .expect(201);

    sessionId = response.body.data.id as number;
    expect(response.body.data.workout_date).toBe('2026-01-15');
    expect(response.body.data.notes).toBe('Test session');
  });

  it('rejects an invalid workout date', async () => {
    await request(app).post('/api/workouts').send({ workout_date: '15-01-2026' }).expect(400);
  });

  it('lists workout sessions', async () => {
    const response = await request(app).get('/api/workouts?limit=10').expect(200);
    expect(Array.isArray(response.body.data)).toBe(true);
  });

  it('filters sessions by date range', async () => {
    const response = await request(app)
      .get('/api/workouts?from=2026-01-01&to=2026-01-31')
      .expect(200);

    expect(
      response.body.data.some((session: { id: number }) => session.id === sessionId),
    ).toBe(true);
  });

  it('fetches a session with its sets', async () => {
    const response = await request(app).get(`/api/workouts/${sessionId}`).expect(200);
    expect(response.body.data.id).toBe(sessionId);
    expect(Array.isArray(response.body.data.sets)).toBe(true);
  });

  it('updates a session', async () => {
    const response = await request(app)
      .put(`/api/workouts/${sessionId}`)
      .send({ duration_minutes: 55, notes: 'Updated notes' })
      .expect(200);

    expect(response.body.data.duration_minutes).toBe(55);
    expect(response.body.data.notes).toBe('Updated notes');
  });
});

describe('sets', () => {
  it('creates a set', async () => {
    const response = await request(app)
      .post(`/api/workouts/${sessionId}/sets`)
      .send({ exercise_id: exerciseId, weight_kg: 60, reps: 10, is_completed: true })
      .expect(201);

    expect(response.body.data).toMatchObject({
      exercise_id: exerciseId,
      weight_kg: 60,
      reps: 10,
      is_completed: true,
    });
    expect(response.body.data.set_number).toBe(1);
  });

  it('lists the sets of a session', async () => {
    const response = await request(app).get(`/api/workouts/${sessionId}/sets`).expect(200);
    expect(response.body.data).toHaveLength(1);
    expect(response.body.count).toBe(1);
  });

  it('updates a set', async () => {
    const sets = await request(app).get(`/api/workouts/${sessionId}/sets`).expect(200);
    const setId = sets.body.data[0].id as number;

    const response = await request(app)
      .put(`/api/sets/${setId}`)
      .send({ weight_kg: 65, reps: 8 })
      .expect(200);

    expect(response.body.data.weight_kg).toBe(65);
    expect(response.body.data.reps).toBe(8);
  });

  it('toggles the completion state of a set', async () => {
    const sets = await request(app).get(`/api/workouts/${sessionId}/sets`).expect(200);
    const setId = sets.body.data[0].id as number;

    const response = await request(app)
      .put(`/api/sets/${setId}`)
      .send({ is_completed: false })
      .expect(200);

    expect(response.body.data.is_completed).toBe(false);
  });

  it('rejects a set with a negative weight', async () => {
    await request(app)
      .post(`/api/workouts/${sessionId}/sets`)
      .send({ exercise_id: exerciseId, weight_kg: -10, reps: 5 })
      .expect(400);
  });

  it('rejects a set with fractional reps', async () => {
    await request(app)
      .post(`/api/workouts/${sessionId}/sets`)
      .send({ exercise_id: exerciseId, weight_kg: 10, reps: 2.5 })
      .expect(400);
  });

  it('renumbers the remaining sets after a deletion', async () => {
    // Add a second and third set.
    await request(app)
      .post(`/api/workouts/${sessionId}/sets`)
      .send({ exercise_id: exerciseId, weight_kg: 70, reps: 6 })
      .expect(201);
    await request(app)
      .post(`/api/workouts/${sessionId}/sets`)
      .send({ exercise_id: exerciseId, weight_kg: 75, reps: 4 })
      .expect(201);

    const before = await request(app).get(`/api/workouts/${sessionId}/sets`).expect(200);
    expect(before.body.data).toHaveLength(3);

    // Delete the middle set.
    await request(app).delete(`/api/sets/${before.body.data[1].id}`).expect(204);

    const after = await request(app).get(`/api/workouts/${sessionId}/sets`).expect(200);
    expect(after.body.data).toHaveLength(2);
    expect(after.body.data.map((set: { set_number: number }) => set.set_number)).toEqual([1, 2]);
  });

  it('deletes a set', async () => {
    const sets = await request(app).get(`/api/workouts/${sessionId}/sets`).expect(200);
    await request(app).delete(`/api/sets/${sets.body.data[0].id}`).expect(204);

    const after = await request(app).get(`/api/workouts/${sessionId}/sets`).expect(200);
    expect(after.body.data).toHaveLength(1);
  });

  it('returns 404 for a missing set', async () => {
    await request(app).get('/api/sets/999999999').expect(404);
  });
});

describe('progress', () => {
  it('returns an overall progress summary', async () => {
    const response = await request(app).get('/api/progress/summary').expect(200);
    expect(response.body.data).toBeDefined();
  });

  it('returns the progression for an exercise', async () => {
    const response = await request(app).get(`/api/progress/${exerciseId}`).expect(200);
    expect(response.body.data).toBeDefined();
  });

  it('returns the previous performance for an exercise', async () => {
    const response = await request(app)
      .get(`/api/progress/${exerciseId}/previous?before_date=2026-01-16`)
      .expect(200);
    expect(response.body.data).toBeDefined();
  });
});

describe('error handling', () => {
  it('returns 404 for an unknown route', async () => {
    const response = await request(app).get('/api/does-not-exist').expect(404);
    expect(response.body.error).toBeDefined();
  });

  it('returns a JSON error for malformed JSON', async () => {
    const response = await request(app)
      .post('/api/exercises')
      .set('Content-Type', 'application/json')
      .send('{"name":')
      .expect(400);
    expect(response.body.error).toBeDefined();
  });
});
