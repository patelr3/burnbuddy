import { describe, it, expect, vi, beforeEach } from 'vitest';
import express from 'express';
import request from 'supertest';

const { mockVerifyIdToken, mockGroupWorkoutsQueryGet, mockGroupWorkoutsQueryChain } = vi.hoisted(
  () => {
    const mockVerifyIdToken = vi.fn();
    const mockGroupWorkoutsQueryGet = vi.fn();
    const mockGroupWorkoutsQueryChain = {
      where: vi.fn(),
      get: mockGroupWorkoutsQueryGet,
    };
    return { mockVerifyIdToken, mockGroupWorkoutsQueryGet, mockGroupWorkoutsQueryChain };
  },
);

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
        return { where: () => mockGroupWorkoutsQueryChain };
      }
      return {};
    },
  }),
}));

import groupWorkoutsRouter from './group-workouts';
import { requireAuth } from '../middleware/auth';

const app = express();
app.use(express.json());
app.use('/group-workouts', groupWorkoutsRouter);

const AUTH_HEADER = { Authorization: 'Bearer valid-token' };
const UID = 'user-123';

beforeEach(() => {
  vi.resetAllMocks();
  mockVerifyIdToken.mockResolvedValue({ uid: UID });
  mockGroupWorkoutsQueryChain.where.mockReturnThis();
  mockGroupWorkoutsQueryGet.mockResolvedValue({ docs: [] });
});

describe('GET /group-workouts', () => {
  it('returns 401 when unauthenticated', async () => {
    const res = await request(app).get('/group-workouts');
    expect(res.status).toBe(401);
  });

  it('returns empty array when user has no group workouts', async () => {
    const res = await request(app).get('/group-workouts').set(AUTH_HEADER);
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

    const res = await request(app).get('/group-workouts').set(AUTH_HEADER);
    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(2);
    expect(res.body[0]).toMatchObject({ id: 'gw-1', type: 'buddy' });
    expect(res.body[1]).toMatchObject({ id: 'gw-2', type: 'squad' });
  });
});
