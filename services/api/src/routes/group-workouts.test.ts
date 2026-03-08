import { describe, it, expect, vi, beforeEach } from 'vitest';
import express from 'express';
import request from 'supertest';

const {
  mockVerifyIdToken,
  mockGroupWorkoutsQueryGet,
  mockGroupWorkoutsQueryChain,
  mockGWDocGet,
  mockGWDocRef,
  mockWorkoutDocGet,
  mockWorkoutDocRef,
  mockUserDocGet,
  mockUserDocRef,
} = vi.hoisted(() => {
  const mockVerifyIdToken = vi.fn();
  const mockGroupWorkoutsQueryGet = vi.fn();
  const mockGroupWorkoutsQueryChain = {
    where: vi.fn(),
    get: mockGroupWorkoutsQueryGet,
  };
  const mockGWDocGet = vi.fn();
  const mockGWDocRef = vi.fn(() => ({ get: mockGWDocGet }));
  const mockWorkoutDocGet = vi.fn();
  const mockWorkoutDocRef = vi.fn(() => ({ get: mockWorkoutDocGet }));
  const mockUserDocGet = vi.fn();
  const mockUserDocRef = vi.fn(() => ({ get: mockUserDocGet }));
  return {
    mockVerifyIdToken,
    mockGroupWorkoutsQueryGet,
    mockGroupWorkoutsQueryChain,
    mockGWDocGet,
    mockGWDocRef,
    mockWorkoutDocGet,
    mockWorkoutDocRef,
    mockUserDocGet,
    mockUserDocRef,
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
      if (name === 'groupWorkouts') {
        return {
          where: () => mockGroupWorkoutsQueryChain,
          doc: mockGWDocRef,
        };
      }
      if (name === 'workouts') {
        return { doc: mockWorkoutDocRef };
      }
      if (name === 'users') {
        return { doc: mockUserDocRef };
      }
      return {};
    },
  }),
}));

import groupWorkoutsRouter from './group-workouts';

function buildApp() {
  const app = express();
  app.use(express.json());
  app.use('/group-workouts', groupWorkoutsRouter);
  return app;
}

const AUTH_HEADER = { Authorization: 'Bearer valid-token' };
const UID = 'user-123';
const OTHER_UID = 'user-456';
const GW_ID = 'gw-1';

beforeEach(() => {
  vi.resetAllMocks();
  mockVerifyIdToken.mockResolvedValue({ uid: UID });
  mockGroupWorkoutsQueryChain.where.mockReturnThis();
  mockGroupWorkoutsQueryGet.mockResolvedValue({ docs: [] });
});

describe('GET /group-workouts', () => {
  it('returns 401 when unauthenticated', async () => {
    const res = await request(buildApp()).get('/group-workouts');
    expect(res.status).toBe(401);
  });

  it('returns empty array when user has no group workouts', async () => {
    const res = await request(buildApp()).get('/group-workouts').set(AUTH_HEADER);
    expect(res.status).toBe(200);
    expect(res.body).toEqual([]);
  });

  it('returns group workouts for the authenticated user', async () => {
    const gw1 = {
      id: 'gw-1',
      type: 'buddy',
      referenceId: 'bb-1',
      memberUids: [UID, 'user-456'],
      startedAt: '2026-03-01T10:00:00.000Z',
      workoutIds: ['w-1', 'w-2'],
    };
    const gw2 = {
      id: 'gw-2',
      type: 'squad',
      referenceId: 'sq-1',
      memberUids: [UID, 'user-456', 'user-789'],
      startedAt: '2026-03-02T08:00:00.000Z',
      workoutIds: ['w-3', 'w-4', 'w-5'],
    };
    mockGroupWorkoutsQueryGet.mockResolvedValue({
      docs: [
        { data: () => gw1 },
        { data: () => gw2 },
      ],
    });

    const res = await request(buildApp()).get('/group-workouts').set(AUTH_HEADER);
    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(2);
    expect(res.body[0]).toMatchObject({ id: 'gw-1', type: 'buddy' });
    expect(res.body[1]).toMatchObject({ id: 'gw-2', type: 'squad' });
  });
});

describe('GET /group-workouts/:id', () => {
  it('returns 401 when unauthenticated', async () => {
    const res = await request(buildApp()).get(`/group-workouts/${GW_ID}`);
    expect(res.status).toBe(401);
  });

  it('returns 404 when the group workout does not exist', async () => {
    mockGWDocGet.mockResolvedValueOnce({ exists: false });

    const res = await request(buildApp())
      .get(`/group-workouts/${GW_ID}`)
      .set(AUTH_HEADER);

    expect(res.status).toBe(404);
    expect(res.body).toMatchObject({ error: 'Group workout not found' });
  });

  it('returns 403 when user is not a member', async () => {
    mockGWDocGet.mockResolvedValueOnce({
      exists: true,
      data: () => ({
        id: GW_ID,
        type: 'buddy',
        referenceId: 'bb-1',
        memberUids: ['other-1', 'other-2'],
        startedAt: '2026-03-01T10:00:00.000Z',
        workoutIds: ['w-1', 'w-2'],
      }),
    });

    const res = await request(buildApp())
      .get(`/group-workouts/${GW_ID}`)
      .set(AUTH_HEADER);

    expect(res.status).toBe(403);
    expect(res.body).toMatchObject({ error: 'You are not a member of this group workout' });
  });

  it('returns the group workout with enriched participants', async () => {
    const groupWorkout = {
      id: GW_ID,
      type: 'buddy',
      referenceId: 'bb-1',
      memberUids: [UID, OTHER_UID],
      startedAt: '2026-03-01T10:00:00.000Z',
      workoutIds: ['w-1', 'w-2'],
    };

    mockGWDocGet.mockResolvedValueOnce({
      exists: true,
      data: () => groupWorkout,
    });

    // Mock workout docs
    mockWorkoutDocGet
      .mockResolvedValueOnce({
        exists: true,
        data: () => ({
          id: 'w-1',
          uid: UID,
          type: 'Running',
          startedAt: '2026-03-01T10:00:00.000Z',
          endedAt: '2026-03-01T10:45:00.000Z',
          status: 'completed',
        }),
      })
      .mockResolvedValueOnce({
        exists: true,
        data: () => ({
          id: 'w-2',
          uid: OTHER_UID,
          type: 'HIIT',
          startedAt: '2026-03-01T10:05:00.000Z',
          status: 'active',
        }),
      });

    // Mock user profile docs
    mockUserDocGet
      .mockResolvedValueOnce({
        exists: true,
        data: () => ({
          uid: UID,
          displayName: 'Alice',
          email: 'alice@test.com',
          createdAt: '2026-01-01T00:00:00.000Z',
        }),
      })
      .mockResolvedValueOnce({
        exists: true,
        data: () => ({
          uid: OTHER_UID,
          displayName: 'Bob',
          email: 'bob@test.com',
          createdAt: '2026-01-01T00:00:00.000Z',
        }),
      });

    const res = await request(buildApp())
      .get(`/group-workouts/${GW_ID}`)
      .set(AUTH_HEADER);

    expect(res.status).toBe(200);
    expect(res.body.id).toBe(GW_ID);
    expect(res.body.participants).toHaveLength(2);
    expect(res.body.participants[0]).toMatchObject({
      uid: UID,
      displayName: 'Alice',
      workoutType: 'Running',
      startedAt: '2026-03-01T10:00:00.000Z',
      endedAt: '2026-03-01T10:45:00.000Z',
      status: 'completed',
    });
    expect(res.body.participants[1]).toMatchObject({
      uid: OTHER_UID,
      displayName: 'Bob',
      workoutType: 'HIIT',
      startedAt: '2026-03-01T10:05:00.000Z',
      endedAt: null,
      status: 'active',
    });
  });

  it('handles missing workout or profile documents gracefully', async () => {
    const groupWorkout = {
      id: GW_ID,
      type: 'buddy',
      referenceId: 'bb-1',
      memberUids: [UID, OTHER_UID],
      startedAt: '2026-03-01T10:00:00.000Z',
      workoutIds: ['w-1', 'w-missing'],
    };

    mockGWDocGet.mockResolvedValueOnce({
      exists: true,
      data: () => groupWorkout,
    });

    // First workout exists, second doesn't
    mockWorkoutDocGet
      .mockResolvedValueOnce({
        exists: true,
        data: () => ({
          id: 'w-1',
          uid: UID,
          type: 'Cycling',
          startedAt: '2026-03-01T10:00:00.000Z',
          endedAt: '2026-03-01T11:00:00.000Z',
          status: 'completed',
        }),
      })
      .mockResolvedValueOnce({ exists: false });

    // First user profile exists, second doesn't
    mockUserDocGet
      .mockResolvedValueOnce({
        exists: true,
        data: () => ({
          uid: UID,
          displayName: 'Alice',
          email: 'alice@test.com',
          createdAt: '2026-01-01T00:00:00.000Z',
        }),
      })
      .mockResolvedValueOnce({ exists: false });

    const res = await request(buildApp())
      .get(`/group-workouts/${GW_ID}`)
      .set(AUTH_HEADER);

    expect(res.status).toBe(200);
    // Only the existing workout should appear in participants
    expect(res.body.participants).toHaveLength(1);
    expect(res.body.participants[0]).toMatchObject({
      uid: UID,
      displayName: 'Alice',
      workoutType: 'Cycling',
    });
  });
});
