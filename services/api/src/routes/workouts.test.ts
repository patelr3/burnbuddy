import { describe, it, expect, vi, beforeEach } from 'vitest';
import express from 'express';
import request from 'supertest';

// vi.hoisted ensures mock variables are created before the mock factory runs
const {
  mockVerifyIdToken,
  // workouts — doc operations
  mockWorkoutsDocGet,
  mockWorkoutsDocSet,
  mockWorkoutsDocUpdate,
  mockWorkoutsDocRef,
  // workouts — query chain
  mockWorkoutsQueryGet,
  mockWorkoutsQueryChain,
} = vi.hoisted(() => {
  const mockVerifyIdToken = vi.fn();

  // workouts — doc
  const mockWorkoutsDocGet = vi.fn();
  const mockWorkoutsDocSet = vi.fn();
  const mockWorkoutsDocUpdate = vi.fn();
  const mockWorkoutsDocRef = vi.fn(() => ({
    get: mockWorkoutsDocGet,
    set: mockWorkoutsDocSet,
    update: mockWorkoutsDocUpdate,
  }));

  // workouts — query chain (supports compound where calls)
  const mockWorkoutsQueryGet = vi.fn();
  const mockWorkoutsQueryChain = {
    where: vi.fn(),
    get: mockWorkoutsQueryGet,
  };

  return {
    mockVerifyIdToken,
    mockWorkoutsDocGet,
    mockWorkoutsDocSet,
    mockWorkoutsDocUpdate,
    mockWorkoutsDocRef,
    mockWorkoutsQueryGet,
    mockWorkoutsQueryChain,
  };
});

vi.mock('../lib/firebase', () => ({
  admin: {
    auth: () => ({ verifyIdToken: mockVerifyIdToken }),
  },
  initFirebase: vi.fn(),
}));

vi.mock('../lib/firestore', () => ({
  getDb: () => ({
    collection: (name: string) => {
      if (name === 'workouts') {
        return {
          doc: mockWorkoutsDocRef,
          where: () => mockWorkoutsQueryChain,
        };
      }
      return {};
    },
  }),
}));

import workoutsRouter, { autoEndStaleWorkouts } from './workouts';

function buildApp() {
  const app = express();
  app.use(express.json());
  app.use('/workouts', workoutsRouter);
  return app;
}

const VALID_TOKEN = 'Bearer valid.token';
const TEST_UID = 'user-abc-123';
const OTHER_UID = 'user-xyz-456';
const WORKOUT_ID = 'workout-id-001';

beforeEach(() => {
  vi.resetAllMocks();

  // Re-setup auth mock
  mockVerifyIdToken.mockResolvedValue({ uid: TEST_UID });

  // Re-setup query chain (mockReturnThis must be re-applied after resetAllMocks)
  mockWorkoutsQueryChain.where.mockReturnThis();

  // Re-setup doc refs
  mockWorkoutsDocRef.mockImplementation(() => ({
    get: mockWorkoutsDocGet,
    set: mockWorkoutsDocSet,
    update: mockWorkoutsDocUpdate,
  }));
});

// ── POST /workouts ─────────────────────────────────────────────────────────────

describe('POST /workouts', () => {
  it('returns 401 when unauthenticated', async () => {
    const res = await request(buildApp()).post('/workouts');
    expect(res.status).toBe(401);
  });

  it('returns 400 when type is missing', async () => {
    const res = await request(buildApp())
      .post('/workouts')
      .set('Authorization', VALID_TOKEN)
      .send({});
    expect(res.status).toBe(400);
    expect(res.body).toMatchObject({ error: expect.stringContaining('type') });
  });

  it('creates a workout with status active and returns 201', async () => {
    mockWorkoutsDocSet.mockResolvedValueOnce(undefined);

    const res = await request(buildApp())
      .post('/workouts')
      .set('Authorization', VALID_TOKEN)
      .send({ type: 'Running' });

    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({
      uid: TEST_UID,
      type: 'Running',
      status: 'active',
    });
    expect(res.body.id).toBeDefined();
    expect(res.body.startedAt).toBeDefined();
    expect(res.body.endedAt).toBeUndefined();
    expect(mockWorkoutsDocSet).toHaveBeenCalledOnce();
  });

  it('creates a workout with a custom type', async () => {
    mockWorkoutsDocSet.mockResolvedValueOnce(undefined);

    const res = await request(buildApp())
      .post('/workouts')
      .set('Authorization', VALID_TOKEN)
      .send({ type: 'Pilates' });

    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({ type: 'Pilates', status: 'active' });
  });

  it('accepts all predefined workout types', async () => {
    const workoutTypes = ['Weightlifting', 'Running', 'Cycling', 'Yoga', 'Barre', 'Swimming', 'HIIT', 'Custom'];
    for (const type of workoutTypes) {
      vi.resetAllMocks();
      mockVerifyIdToken.mockResolvedValue({ uid: TEST_UID });
      mockWorkoutsQueryChain.where.mockReturnThis();
      mockWorkoutsDocRef.mockImplementation(() => ({
        get: mockWorkoutsDocGet,
        set: mockWorkoutsDocSet,
        update: mockWorkoutsDocUpdate,
      }));
      mockWorkoutsDocSet.mockResolvedValueOnce(undefined);

      const res = await request(buildApp())
        .post('/workouts')
        .set('Authorization', VALID_TOKEN)
        .send({ type });

      expect(res.status).toBe(201);
      expect(res.body.type).toBe(type);
    }
  });
});

// ── PATCH /workouts/:id/end ────────────────────────────────────────────────────

describe('PATCH /workouts/:id/end', () => {
  it('returns 401 when unauthenticated', async () => {
    const res = await request(buildApp()).patch(`/workouts/${WORKOUT_ID}/end`);
    expect(res.status).toBe(401);
  });

  it('returns 404 when the workout does not exist', async () => {
    mockWorkoutsDocGet.mockResolvedValueOnce({ exists: false });

    const res = await request(buildApp())
      .patch(`/workouts/${WORKOUT_ID}/end`)
      .set('Authorization', VALID_TOKEN);

    expect(res.status).toBe(404);
  });

  it('returns 403 when user does not own the workout', async () => {
    mockWorkoutsDocGet.mockResolvedValueOnce({
      exists: true,
      data: () => ({ id: WORKOUT_ID, uid: OTHER_UID, type: 'Running', startedAt: '', status: 'active' }),
    });

    const res = await request(buildApp())
      .patch(`/workouts/${WORKOUT_ID}/end`)
      .set('Authorization', VALID_TOKEN);

    expect(res.status).toBe(403);
    expect(res.body).toMatchObject({ error: expect.stringContaining('own') });
  });

  it('returns 409 when the workout is already completed', async () => {
    mockWorkoutsDocGet.mockResolvedValueOnce({
      exists: true,
      data: () => ({
        id: WORKOUT_ID,
        uid: TEST_UID,
        type: 'Running',
        startedAt: '2024-01-01T10:00:00.000Z',
        endedAt: '2024-01-01T11:00:00.000Z',
        status: 'completed',
      }),
    });

    const res = await request(buildApp())
      .patch(`/workouts/${WORKOUT_ID}/end`)
      .set('Authorization', VALID_TOKEN);

    expect(res.status).toBe(409);
    expect(res.body).toMatchObject({ error: expect.stringContaining('already completed') });
  });

  it('ends the workout and returns the updated workout', async () => {
    const activeWorkout = {
      id: WORKOUT_ID,
      uid: TEST_UID,
      type: 'Cycling',
      startedAt: '2024-01-01T10:00:00.000Z',
      status: 'active',
    };
    mockWorkoutsDocGet.mockResolvedValueOnce({ exists: true, data: () => activeWorkout });
    mockWorkoutsDocUpdate.mockResolvedValueOnce(undefined);

    const res = await request(buildApp())
      .patch(`/workouts/${WORKOUT_ID}/end`)
      .set('Authorization', VALID_TOKEN);

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      id: WORKOUT_ID,
      uid: TEST_UID,
      type: 'Cycling',
      status: 'completed',
    });
    expect(res.body.endedAt).toBeDefined();
    expect(mockWorkoutsDocUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ status: 'completed', endedAt: expect.any(String) }),
    );
  });
});

// ── GET /workouts ──────────────────────────────────────────────────────────────

describe('GET /workouts', () => {
  it('returns 401 when unauthenticated', async () => {
    const res = await request(buildApp()).get('/workouts');
    expect(res.status).toBe(401);
  });

  it('returns workout history for the authenticated user', async () => {
    const workout1 = { id: WORKOUT_ID, uid: TEST_UID, type: 'Running', startedAt: '', status: 'active' };
    const workout2 = { id: 'workout-2', uid: TEST_UID, type: 'Yoga', startedAt: '', endedAt: '', status: 'completed' };

    mockWorkoutsQueryGet.mockResolvedValueOnce({
      docs: [{ data: () => workout1 }, { data: () => workout2 }],
    });

    const res = await request(buildApp())
      .get('/workouts')
      .set('Authorization', VALID_TOKEN);

    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(2);
    expect(res.body[0].id).toBe(WORKOUT_ID);
    expect(res.body[1].id).toBe('workout-2');
  });

  it('returns empty array when user has no workouts', async () => {
    mockWorkoutsQueryGet.mockResolvedValueOnce({ docs: [] });

    const res = await request(buildApp())
      .get('/workouts')
      .set('Authorization', VALID_TOKEN);

    expect(res.status).toBe(200);
    expect(res.body).toEqual([]);
  });
});

// ── autoEndStaleWorkouts ───────────────────────────────────────────────────────

describe('autoEndStaleWorkouts', () => {
  it('returns 0 when there are no stale workouts', async () => {
    mockWorkoutsQueryGet.mockResolvedValueOnce({ empty: true, docs: [] });

    const count = await autoEndStaleWorkouts();
    expect(count).toBe(0);
    expect(mockWorkoutsDocUpdate).not.toHaveBeenCalled();
  });

  it('ends stale active workouts and returns the count', async () => {
    const staleDoc1 = { id: 'stale-1', data: () => ({ status: 'active' }) };
    const staleDoc2 = { id: 'stale-2', data: () => ({ status: 'active' }) };

    mockWorkoutsQueryGet.mockResolvedValueOnce({
      empty: false,
      docs: [staleDoc1, staleDoc2],
    });
    mockWorkoutsDocUpdate.mockResolvedValue(undefined);

    const count = await autoEndStaleWorkouts();

    expect(count).toBe(2);
    expect(mockWorkoutsDocUpdate).toHaveBeenCalledTimes(2);
    expect(mockWorkoutsDocUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ status: 'completed', endedAt: expect.any(String) }),
    );
  });

  it('passes the correct cutoff timestamp (1.5 hours ago)', async () => {
    mockWorkoutsQueryGet.mockResolvedValueOnce({ empty: true, docs: [] });

    await autoEndStaleWorkouts();

    // The collection mock's `where` handles the first call ('status', '==', 'active').
    // The chained `mockWorkoutsQueryChain.where` handles the second call ('startedAt', '<=', cutoff).
    expect(mockWorkoutsQueryChain.where).toHaveBeenCalledTimes(1);
    const [field, op, cutoff] = mockWorkoutsQueryChain.where.mock.calls[0] as [string, string, string];
    expect(field).toBe('startedAt');
    expect(op).toBe('<=');
    // cutoff should be close to 1.5h ago (within 5 seconds)
    const cutoffUsed = new Date(cutoff).getTime();
    const expectedCutoff = Date.now() - 90 * 60 * 1000;
    expect(Math.abs(cutoffUsed - expectedCutoff)).toBeLessThan(5000);
  });
});
