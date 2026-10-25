import type { Express } from 'express';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createApp } from '../app.js';
import { closeDatabase } from '../config/database.js';
import { buildDelta, buildRecords } from '../services/trackerService.js';
import { setVolume, totalsForSets } from '../utils/volume.js';
import type { TrackerSession } from '../types/index.js';

/**
 * Tests for the progress tracker: the volume conventions, the session
 * comparison and the new API endpoints.
 *
 * These run against the real MySQL instance used in development. Every
 * record created here is removed again in `afterAll`.
 */

const app: Express = createApp();
const stamp = Date.now().toString(36);
const exerciseName = `Tracker Exercise ${stamp}`;

let exerciseId = 0;
let sessionId = 0;

beforeAll(async () => {
  const response = await request(app)
    .post('/api/exercises')
    .send({ name: exerciseName, muscle_group: 'Test' })
    .expect(201);
  exerciseId = response.body.data.id as number;
});

afterAll(async () => {
  if (sessionId) {
    await request(app).delete(`/api/workouts/${sessionId}`);
  }
  if (exerciseId) {
    await request(app).delete(`/api/exercises/${exerciseId}`);
  }
  await closeDatabase();
});

describe('volume conventions', () => {
  it('multiplies weight by reps for a normal exercise', () => {
    expect(setVolume(50, 12)).toBe(600);
    expect(setVolume(60, 10)).toBe(600);
    expect(setVolume(70, 8)).toBe(560);
  });

  it('doubles the load for a dumbbell exercise', () => {
    expect(setVolume(20, 10, true)).toBe(400);
  });

  it('sums the volume of the completed sets only', () => {
    const totals = totalsForSets(
      [
        { weight_kg: 50, reps: 12, is_completed: true },
        { weight_kg: 60, reps: 10, is_completed: true },
        { weight_kg: 70, reps: 8, is_completed: true },
      ],
      false,
    );
    expect(totals.volume).toBe(1760);
    expect(totals.reps).toBe(30);
    expect(totals.completed).toBe(3);
  });

  it('ignores sets that are not completed', () => {
    const totals = totalsForSets(
      [
        { weight_kg: 50, reps: 12, is_completed: true },
        { weight_kg: 60, reps: 10, is_completed: false },
      ],
      false,
    );
    expect(totals.volume).toBe(600);
    expect(totals.reps).toBe(12);
    expect(totals.completed).toBe(1);
  });
});

describe('delta', () => {
  const build = (volume: number, reps: number, top: number): TrackerSession => ({
    session_id: 1,
    workout_date: '2026-01-01',
    sets: [],
    total_reps: reps,
    total_volume: volume,
    completed_sets: 3,
    top_weight: top,
  });

  it('reports an increase against the previous session', () => {
    const delta = buildDelta(build(1250, 30, 55), build(1130, 30, 50));
    expect(delta.weight).toBe(5);
    expect(delta.reps).toBe(0);
    expect(delta.volume).toBe(120);
    expect(delta.direction).toBe('up');
  });

  it('reports a decrease against the previous session', () => {
    const delta = buildDelta(build(900, 24, 40), build(1130, 30, 50));
    expect(delta.weight).toBe(-10);
    expect(delta.reps).toBe(-6);
    expect(delta.volume).toBe(-230);
    expect(delta.direction).toBe('down');
  });

  it('reports no comparison when there is no previous session', () => {
    const delta = buildDelta(build(900, 24, 40), null);
    expect(delta.weight).toBeNull();
    expect(delta.volume).toBeNull();
    expect(delta.direction).toBe('none');
  });
});

describe('records', () => {
  it('finds the highest weight, the most reps and the best volume', () => {
    const records = buildRecords([
      {
        session_id: 1,
        workout_date: '2026-01-01',
        sets: [
          { set_number: 1, weight_kg: 50, reps: 12, is_completed: true },
          { set_number: 2, weight_kg: 60, reps: 10, is_completed: true },
        ],
        total_reps: 22,
        total_volume: 1200,
        completed_sets: 2,
        top_weight: 60,
      },
      {
        session_id: 2,
        workout_date: '2026-01-08',
        sets: [
          { set_number: 1, weight_kg: 55, reps: 15, is_completed: true },
          { set_number: 2, weight_kg: 65, reps: 8, is_completed: true },
        ],
        total_reps: 23,
        total_volume: 1170,
        completed_sets: 2,
        top_weight: 65,
      },
    ]);

    expect(records.highest_weight).toBe(65);
    expect(records.highest_weight_date).toBe('2026-01-08');
    expect(records.most_reps).toBe(15);
    expect(records.best_volume).toBe(1200);
    expect(records.best_volume_date).toBe('2026-01-01');
  });

  it('ignores sets that are not completed', () => {
    const records = buildRecords([
      {
        session_id: 1,
        workout_date: '2026-01-01',
        sets: [{ set_number: 1, weight_kg: 200, reps: 5, is_completed: false }],
        total_reps: 0,
        total_volume: 0,
        completed_sets: 0,
        top_weight: 0,
      },
    ]);

    expect(records.highest_weight).toBeNull();
    expect(records.best_volume).toBeNull();
  });
});

describe('tracker API', () => {
  it('saves the three sets of an exercise in one request', async () => {
    const session = await request(app)
      .post('/api/workouts')
      .send({ workout_date: '2026-02-02', start_time: '2026-02-02T09:00' })
      .expect(201);
    sessionId = session.body.data.id as number;

    const response = await request(app)
      .put(`/api/workouts/${sessionId}/sets`)
      .send({
        exercise_id: exerciseId,
        sets: [
          { set_number: 1, weight_kg: 50, reps: 12, is_completed: true },
          { set_number: 2, weight_kg: 60, reps: 10, is_completed: true },
          { set_number: 3, weight_kg: 70, reps: 8, is_completed: true },
        ],
      })
      .expect(200);

    expect(response.body.data).toHaveLength(3);
    expect(response.body.data.map((set: { weight_kg: number }) => set.weight_kg)).toEqual([
      50, 60, 70,
    ]);
  });

  it('keeps a different weight for every set', async () => {
    const response = await request(app)
      .get(`/api/workouts/${sessionId}`)
      .expect(200);

    const sets = response.body.data.sets as Array<{
      set_number: number;
      weight_kg: number;
      reps: number;
    }>;

    expect(sets).toHaveLength(3);
    expect(sets[0].weight_kg).toBe(50);
    expect(sets[1].weight_kg).toBe(60);
    expect(sets[2].weight_kg).toBe(70);
  });

  it('calculates the volume of the exercise from the saved sets', async () => {
    const response = await request(app)
      .get(`/api/workouts/${sessionId}`)
      .expect(200);

    // 50x12 + 60x10 + 70x8 = 1760
    expect(response.body.data.total_volume).toBe(1760);
    expect(response.body.data.total_reps).toBe(30);
    expect(response.body.data.completed_sets).toBe(3);
  });

  it('updates a single set without touching the others', async () => {
    const response = await request(app)
      .put(`/api/workouts/${sessionId}/sets`)
      .send({
        exercise_id: exerciseId,
        sets: [
          { set_number: 1, weight_kg: 52.5, reps: 11, is_completed: true },
          { set_number: 2, weight_kg: 60, reps: 10, is_completed: true },
          { set_number: 3, weight_kg: 70, reps: 8, is_completed: true },
        ],
      })
      .expect(200);

    expect(response.body.data[0].weight_kg).toBe(52.5);
    expect(response.body.data[0].reps).toBe(11);
    expect(response.body.data[1].weight_kg).toBe(60);
  });

  it('returns the tracker for the exercise', async () => {
    const response = await request(app).get(`/api/tracker/${exerciseId}`).expect(200);

    expect(response.body.data.exercise_id).toBe(exerciseId);
    expect(response.body.data.sessions).toHaveLength(1);
    expect(response.body.data.latest.sets).toHaveLength(3);
    expect(response.body.data.delta.direction).toBe('none');
  });

  it('returns the personal records', async () => {
    const response = await request(app).get('/api/tracker/records').expect(200);
    expect(Array.isArray(response.body.data)).toBe(true);
  });

  it('returns the weekly overview with both weeks', async () => {
    const response = await request(app).get('/api/tracker/weekly').expect(200);
    expect(response.body.data.current.week_start).toBeDefined();
    expect(response.body.data.previous.week_start).toBeDefined();
  });

  it('filters the tracker by date range', async () => {
    const response = await request(app)
      .get(`/api/tracker/${exerciseId}?from=2026-01-01&to=2026-01-31`)
      .expect(200);

    expect(response.body.data.sessions).toHaveLength(0);
  });
});

describe('schedule API', () => {
  it('returns the weekly programme', async () => {
    const response = await request(app).get('/api/schedule').expect(200);
    expect(response.body.data.days).toBeDefined();
  });

  it('returns the programme for one day', async () => {
    const response = await request(app).get('/api/schedule/1').expect(200);
    expect(Array.isArray(response.body.data)).toBe(true);
  });

  it('rejects a day outside the week', async () => {
    await request(app).get('/api/schedule/8').expect(400);
  });
});

describe('dumbbell volume', () => {
  it('counts the load of both dumbbells in the session total', async () => {
    // A dumbbell exercise, entered as the load of a single dumbbell.
    const dumbbell = await request(app)
      .post('/api/exercises')
      .send({ name: `Dumbbell Test ${stamp}`, muscle_group: 'Test', is_dumbbell: true })
      .expect(201);
    const dumbbellId = dumbbell.body.data.id as number;

    const session = await request(app)
      .post('/api/workouts')
      .send({ workout_date: '2026-03-02' })
      .expect(201);
    const dumbbellSessionId = session.body.data.id as number;

    await request(app)
      .put(`/api/workouts/${dumbbellSessionId}/sets`)
      .send({
        exercise_id: dumbbellId,
        sets: [
          { set_number: 1, weight_kg: 20, reps: 10, is_completed: true },
          { set_number: 2, weight_kg: 20, reps: 10, is_completed: true },
          { set_number: 3, weight_kg: 20, reps: 10, is_completed: true },
        ],
      })
      .expect(200);

    const detail = await request(app)
      .get(`/api/workouts/${dumbbellSessionId}`)
      .expect(200);

    // 20 kg x 2 dumbbells x 10 reps = 400 per set, three sets = 1200.
    expect(detail.body.data.total_volume).toBe(1200);
    expect(detail.body.data.total_reps).toBe(30);
    expect(detail.body.data.exercises[0].total_volume).toBe(1200);

    await request(app).delete(`/api/workouts/${dumbbellSessionId}`).expect(204);
    await request(app).delete(`/api/exercises/${dumbbellId}`).expect(204);
  });
});

describe('concurrent saves', () => {
  it('does not fail when two saves for the same exercise overlap', async () => {
    const session = await request(app)
      .post('/api/workouts')
      .send({ workout_date: '2026-05-01' })
      .expect(201);
    const id = session.body.data.id as number;

    // Both requests write the same three set numbers at the same time.
    const body = {
      exercise_id: exerciseId,
      sets: [
        { set_number: 1, weight_kg: 50, reps: 12, is_completed: true },
        { set_number: 2, weight_kg: 60, reps: 10, is_completed: true },
        { set_number: 3, weight_kg: 70, reps: 8, is_completed: true },
      ],
    };

    const [first, second] = await Promise.all([
      request(app).put(`/api/workouts/${id}/sets`).send(body),
      request(app).put(`/api/workouts/${id}/sets`).send(body),
    ]);

    expect(first.status).toBe(200);
    expect(second.status).toBe(200);

    // The exercise still has exactly three sets.
    const detail = await request(app).get(`/api/workouts/${id}`).expect(200);
    expect(detail.body.data.sets).toHaveLength(3);

    await request(app).delete(`/api/workouts/${id}`).expect(204);
  });

  it('keeps the set numbers when a middle set is still empty', async () => {
    const session = await request(app)
      .post('/api/workouts')
      .send({ workout_date: '2026-05-08' })
      .expect(201);
    const id = session.body.data.id as number;

    // Set 2 has no values yet, so only sets 1 and 3 are written.
    await request(app)
      .put(`/api/workouts/${id}/sets`)
      .send({
        exercise_id: exerciseId,
        sets: [
          { set_number: 1, weight_kg: 50, reps: 12, is_completed: true },
          { set_number: 3, weight_kg: 70, reps: 8, is_completed: true },
        ],
      })
      .expect(200);

    const detail = await request(app).get(`/api/workouts/${id}`).expect(200);
    const numbers = detail.body.data.sets.map((set: { set_number: number }) => set.set_number);
    expect(numbers).toContain(1);
    expect(numbers).toContain(3);

    await request(app).delete(`/api/workouts/${id}`).expect(204);
  });
});

describe('session isolation', () => {
  it('keeps each workout date in its own record', async () => {
    const first = await request(app)
      .post('/api/workouts')
      .send({ workout_date: '2026-04-01' })
      .expect(201);
    const second = await request(app)
      .post('/api/workouts')
      .send({ workout_date: '2026-04-08' })
      .expect(201);

    const firstId = first.body.data.id as number;
    const secondId = second.body.data.id as number;
    expect(firstId).not.toBe(secondId);

    await request(app)
      .put(`/api/workouts/${firstId}/sets`)
      .send({
        exercise_id: exerciseId,
        sets: [
          { set_number: 1, weight_kg: 40, reps: 12, is_completed: true },
          { set_number: 2, weight_kg: 45, reps: 10, is_completed: true },
          { set_number: 3, weight_kg: 50, reps: 8, is_completed: true },
        ],
      })
      .expect(200);

    await request(app)
      .put(`/api/workouts/${secondId}/sets`)
      .send({
        exercise_id: exerciseId,
        sets: [
          { set_number: 1, weight_kg: 45, reps: 12, is_completed: true },
          { set_number: 2, weight_kg: 50, reps: 10, is_completed: true },
          { set_number: 3, weight_kg: 55, reps: 8, is_completed: true },
        ],
      })
      .expect(200);

    // The first session keeps its own values.
    // 40x12 + 45x10 + 50x8 = 480 + 450 + 400 = 1330
    const firstDetail = await request(app).get(`/api/workouts/${firstId}`).expect(200);
    expect(firstDetail.body.data.total_volume).toBe(1330);
    expect(firstDetail.body.data.workout_date).toBe('2026-04-01');

    // The second session keeps its own values.
    // 45x12 + 50x10 + 55x8 = 540 + 500 + 440 = 1480
    const secondDetail = await request(app).get(`/api/workouts/${secondId}`).expect(200);
    expect(secondDetail.body.data.total_volume).toBe(1480);
    expect(secondDetail.body.data.workout_date).toBe('2026-04-08');

    await request(app).delete(`/api/workouts/${firstId}`).expect(204);
    await request(app).delete(`/api/workouts/${secondId}`).expect(204);
  });
});
