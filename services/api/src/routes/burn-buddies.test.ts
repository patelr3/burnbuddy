import { describe, it, expect, vi, beforeEach } from 'vitest';
import express from 'express';
import request from 'supertest';

// vi.hoisted ensures mock variables are created before the mock factory runs
const {
  mockVerifyIdToken,
  // burnBuddyRequests — doc operations
  mockBBRequestDocGet,
  mockBBRequestDocSet,
  mockBBRequestDocUpdate,
  mockBBRequestDocRef,
  // burnBuddyRequests — query
  mockBBRequestQueryGet,
  mockBBRequestQueryChain,
  // burnBuddies — doc operations
  mockBBDocGet,
  mockBBDocSet,
  mockBBDocDelete,
  mockBBDocUpdate,
  mockBBDocRef,
  // burnBuddies — query
  mockBBQueryGet,
  mockBBQueryChain,
  // friends — doc (friendship check)
  mockFriendsDocGet,
  mockFriendsDocRef,
  // workouts — query (for streaks - legacy, kept for other potential uses)
  mockWorkoutsQueryGet,
  mockWorkoutsQueryChain,
  // groupWorkouts — query (for streaks endpoint)
  mockGroupWorkoutsQueryGet,
  mockGroupWorkoutsQueryChain,
  // users — doc (partner displayName lookup)
  mockUsersDocGet,
  mockUsersDocRef,
} = vi.hoisted(() => {
  const mockVerifyIdToken = vi.fn();

  // burnBuddyRequests — doc
  const mockBBRequestDocGet = vi.fn();
  const mockBBRequestDocSet = vi.fn();
  const mockBBRequestDocUpdate = vi.fn();
  const mockBBRequestDocRef = vi.fn(() => ({
    get: mockBBRequestDocGet,
    set: mockBBRequestDocSet,
    update: mockBBRequestDocUpdate,
  }));

  // burnBuddyRequests — query chain
  const mockBBRequestQueryGet = vi.fn();
  const mockBBRequestQueryChain = {
    where: vi.fn(),
    limit: vi.fn(),
    get: mockBBRequestQueryGet,
  };

  // burnBuddies — doc
  const mockBBDocGet = vi.fn();
  const mockBBDocSet = vi.fn();
  const mockBBDocDelete = vi.fn();
  const mockBBDocUpdate = vi.fn();
  const mockBBDocRef = vi.fn(() => ({
    get: mockBBDocGet,
    set: mockBBDocSet,
    delete: mockBBDocDelete,
    update: mockBBDocUpdate,
  }));

  // burnBuddies — query chain
  const mockBBQueryGet = vi.fn();
  const mockBBQueryChain = {
    where: vi.fn(),
    get: mockBBQueryGet,
  };

  // friends — doc (friendship check only)
  const mockFriendsDocGet = vi.fn();
  const mockFriendsDocRef = vi.fn(() => ({ get: mockFriendsDocGet }));

  // workouts — query chain (for streaks endpoint — legacy)
  const mockWorkoutsQueryGet = vi.fn();
  const mockWorkoutsQueryChain = {
    where: vi.fn(),
    get: mockWorkoutsQueryGet,
  };

  // groupWorkouts — query chain (for streaks endpoint)
  const mockGroupWorkoutsQueryGet = vi.fn();
  const mockGroupWorkoutsQueryChain = {
    where: vi.fn(),
    get: mockGroupWorkoutsQueryGet,
  };

  // users — doc (partner displayName lookup for calendar)
  const mockUsersDocGet = vi.fn();
  const mockUsersDocRef = vi.fn(() => ({ get: mockUsersDocGet }));

  return {
    mockVerifyIdToken,
    mockBBRequestDocGet,
    mockBBRequestDocSet,
    mockBBRequestDocUpdate,
    mockBBRequestDocRef,
    mockBBRequestQueryGet,
    mockBBRequestQueryChain,
    mockBBDocGet,
    mockBBDocSet,
    mockBBDocDelete,
    mockBBDocUpdate,
    mockBBDocRef,
    mockBBQueryGet,
    mockBBQueryChain,
    mockFriendsDocGet,
    mockFriendsDocRef,
    mockWorkoutsQueryGet,
    mockWorkoutsQueryChain,
    mockGroupWorkoutsQueryGet,
    mockGroupWorkoutsQueryChain,
    mockUsersDocGet,
    mockUsersDocRef,
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
      if (name === 'burnBuddyRequests') {
        return {
          doc: mockBBRequestDocRef,
          where: () => mockBBRequestQueryChain,
        };
      }
      if (name === 'burnBuddies') {
        return {
          doc: mockBBDocRef,
          where: () => mockBBQueryChain,
        };
      }
      if (name === 'friends') {
        return { doc: mockFriendsDocRef };
      }
      if (name === 'workouts') {
        return { where: () => mockWorkoutsQueryChain };
      }
      if (name === 'groupWorkouts') {
        return { where: () => mockGroupWorkoutsQueryChain };
      }
      if (name === 'users') {
        return { doc: mockUsersDocRef };
      }
      return {};
    },
  }),
}));

import burnBuddiesRouter from './burn-buddies';

function buildApp() {
  const app = express();
  app.use(express.json());
  app.use('/burn-buddies', burnBuddiesRouter);
  return app;
}

const VALID_TOKEN = 'Bearer valid.token';
const TEST_UID = 'user-abc-123';
const OTHER_UID = 'user-xyz-456';
const BURN_BUDDY_ID = 'bb-id-001';
const REQUEST_ID = 'bbr-id-001';

beforeEach(() => {
  vi.resetAllMocks();

  // Re-setup auth mock
  mockVerifyIdToken.mockResolvedValue({ uid: TEST_UID });

  // Re-setup query chains (mockReturnThis must be re-applied after resetAllMocks)
  mockBBRequestQueryChain.where.mockReturnThis();
  mockBBRequestQueryChain.limit.mockReturnThis();
  mockBBQueryChain.where.mockReturnThis();
  mockWorkoutsQueryChain.where.mockReturnThis();
  mockGroupWorkoutsQueryChain.where.mockReturnThis();

  // Re-setup doc refs
  mockBBRequestDocRef.mockImplementation(() => ({
    get: mockBBRequestDocGet,
    set: mockBBRequestDocSet,
    update: mockBBRequestDocUpdate,
  }));
  mockBBDocRef.mockImplementation(() => ({
    get: mockBBDocGet,
    set: mockBBDocSet,
    delete: mockBBDocDelete,
    update: mockBBDocUpdate,
  }));
  mockFriendsDocRef.mockImplementation(() => ({ get: mockFriendsDocGet }));
  mockUsersDocRef.mockImplementation(() => ({ get: mockUsersDocGet }));
});

// ── POST /burn-buddies/requests ────────────────────────────────────────────────

describe('POST /burn-buddies/requests', () => {
  it('returns 401 when unauthenticated', async () => {
    const res = await request(buildApp()).post('/burn-buddies/requests');
    expect(res.status).toBe(401);
  });

  it('returns 400 when toUid is missing', async () => {
    const res = await request(buildApp())
      .post('/burn-buddies/requests')
      .set('Authorization', VALID_TOKEN)
      .send({});
    expect(res.status).toBe(400);
    expect(res.body).toMatchObject({ error: expect.stringContaining('toUid') });
  });

  it('returns 400 when toUid equals own uid', async () => {
    const res = await request(buildApp())
      .post('/burn-buddies/requests')
      .set('Authorization', VALID_TOKEN)
      .send({ toUid: TEST_UID });
    expect(res.status).toBe(400);
    expect(res.body).toMatchObject({ error: expect.stringContaining('yourself') });
  });

  it('returns 400 when users are not friends', async () => {
    mockFriendsDocGet.mockResolvedValueOnce({ exists: false });

    const res = await request(buildApp())
      .post('/burn-buddies/requests')
      .set('Authorization', VALID_TOKEN)
      .send({ toUid: OTHER_UID });

    expect(res.status).toBe(400);
    expect(res.body).toMatchObject({ error: expect.stringContaining('friends') });
  });

  it('returns 409 when a pending request already exists', async () => {
    mockFriendsDocGet.mockResolvedValueOnce({ exists: true });
    mockBBRequestQueryGet.mockResolvedValueOnce({ empty: false });

    const res = await request(buildApp())
      .post('/burn-buddies/requests')
      .set('Authorization', VALID_TOKEN)
      .send({ toUid: OTHER_UID });

    expect(res.status).toBe(409);
    expect(res.body).toMatchObject({ error: expect.stringContaining('already exists') });
  });

  it('creates and returns a new Burn Buddy request with 201', async () => {
    mockFriendsDocGet.mockResolvedValueOnce({ exists: true });
    mockBBRequestQueryGet.mockResolvedValueOnce({ empty: true });
    mockBBRequestDocSet.mockResolvedValueOnce(undefined);

    const res = await request(buildApp())
      .post('/burn-buddies/requests')
      .set('Authorization', VALID_TOKEN)
      .send({ toUid: OTHER_UID });

    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({
      fromUid: TEST_UID,
      toUid: OTHER_UID,
      status: 'pending',
    });
    expect(res.body.id).toBeDefined();
    expect(res.body.createdAt).toBeDefined();
    expect(mockBBRequestDocSet).toHaveBeenCalledOnce();
  });
});

// ── GET /burn-buddies/requests ─────────────────────────────────────────────────

describe('GET /burn-buddies/requests', () => {
  it('returns 401 when unauthenticated', async () => {
    const res = await request(buildApp()).get('/burn-buddies/requests');
    expect(res.status).toBe(401);
  });

  it('returns incoming and outgoing pending requests', async () => {
    const incomingReq = { id: REQUEST_ID, fromUid: OTHER_UID, toUid: TEST_UID, status: 'pending', createdAt: '' };
    const outgoingReq = { id: 'bbr-2', fromUid: TEST_UID, toUid: OTHER_UID, status: 'pending', createdAt: '' };

    mockBBRequestQueryGet
      .mockResolvedValueOnce({ docs: [{ data: () => incomingReq }] })
      .mockResolvedValueOnce({ docs: [{ data: () => outgoingReq }] });

    const res = await request(buildApp())
      .get('/burn-buddies/requests')
      .set('Authorization', VALID_TOKEN);

    expect(res.status).toBe(200);
    expect(res.body.incoming).toHaveLength(1);
    expect(res.body.outgoing).toHaveLength(1);
    expect(res.body.incoming[0].id).toBe(REQUEST_ID);
    expect(res.body.outgoing[0].id).toBe('bbr-2');
  });

  it('returns empty arrays when no pending requests exist', async () => {
    mockBBRequestQueryGet
      .mockResolvedValueOnce({ docs: [] })
      .mockResolvedValueOnce({ docs: [] });

    const res = await request(buildApp())
      .get('/burn-buddies/requests')
      .set('Authorization', VALID_TOKEN);

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ incoming: [], outgoing: [] });
  });
});

// ── POST /burn-buddies/requests/:id/accept ─────────────────────────────────────

describe('POST /burn-buddies/requests/:id/accept', () => {
  it('returns 401 when unauthenticated', async () => {
    const res = await request(buildApp()).post(`/burn-buddies/requests/${REQUEST_ID}/accept`);
    expect(res.status).toBe(401);
  });

  it('returns 404 when the request does not exist', async () => {
    mockBBRequestDocGet.mockResolvedValueOnce({ exists: false });

    const res = await request(buildApp())
      .post(`/burn-buddies/requests/${REQUEST_ID}/accept`)
      .set('Authorization', VALID_TOKEN);

    expect(res.status).toBe(404);
  });

  it('returns 403 when the request was not sent to the current user', async () => {
    mockBBRequestDocGet.mockResolvedValueOnce({
      exists: true,
      data: () => ({ id: REQUEST_ID, fromUid: OTHER_UID, toUid: 'someone-else', status: 'pending', createdAt: '' }),
    });

    const res = await request(buildApp())
      .post(`/burn-buddies/requests/${REQUEST_ID}/accept`)
      .set('Authorization', VALID_TOKEN);

    expect(res.status).toBe(403);
  });

  it('returns 409 when the request is no longer pending', async () => {
    mockBBRequestDocGet.mockResolvedValueOnce({
      exists: true,
      data: () => ({ id: REQUEST_ID, fromUid: OTHER_UID, toUid: TEST_UID, status: 'accepted', createdAt: '' }),
    });

    const res = await request(buildApp())
      .post(`/burn-buddies/requests/${REQUEST_ID}/accept`)
      .set('Authorization', VALID_TOKEN);

    expect(res.status).toBe(409);
  });

  it('accepts the request and creates a BurnBuddy document', async () => {
    mockBBRequestDocGet.mockResolvedValueOnce({
      exists: true,
      data: () => ({ id: REQUEST_ID, fromUid: OTHER_UID, toUid: TEST_UID, status: 'pending', createdAt: '' }),
    });
    mockBBRequestDocUpdate.mockResolvedValueOnce(undefined);
    mockBBDocSet.mockResolvedValueOnce(undefined);

    const res = await request(buildApp())
      .post(`/burn-buddies/requests/${REQUEST_ID}/accept`)
      .set('Authorization', VALID_TOKEN);

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ success: true, burnBuddyRequestId: REQUEST_ID });
    expect(res.body.burnBuddy).toMatchObject({ uid1: expect.any(String), uid2: expect.any(String) });
    expect(mockBBRequestDocUpdate).toHaveBeenCalledWith({ status: 'accepted' });
    expect(mockBBDocSet).toHaveBeenCalledOnce();
  });
});

// ── GET /burn-buddies ──────────────────────────────────────────────────────────

describe('GET /burn-buddies', () => {
  it('returns 401 when unauthenticated', async () => {
    const res = await request(buildApp()).get('/burn-buddies');
    expect(res.status).toBe(401);
  });

  it('returns all burn buddies for the authenticated user', async () => {
    const bb1 = { id: BURN_BUDDY_ID, uid1: TEST_UID, uid2: OTHER_UID, createdAt: '' };
    const bb2 = { id: 'bb-2', uid1: 'user-aaa', uid2: TEST_UID, createdAt: '' };

    mockBBQueryGet
      .mockResolvedValueOnce({ docs: [{ data: () => bb1 }] }) // uid1 == TEST_UID
      .mockResolvedValueOnce({ docs: [{ data: () => bb2 }] }); // uid2 == TEST_UID

    const res = await request(buildApp())
      .get('/burn-buddies')
      .set('Authorization', VALID_TOKEN);

    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(2);
    expect(res.body[0].id).toBe(BURN_BUDDY_ID);
    expect(res.body[1].id).toBe('bb-2');
  });

  it('returns empty array when user has no burn buddies', async () => {
    mockBBQueryGet
      .mockResolvedValueOnce({ docs: [] })
      .mockResolvedValueOnce({ docs: [] });

    const res = await request(buildApp())
      .get('/burn-buddies')
      .set('Authorization', VALID_TOKEN);

    expect(res.status).toBe(200);
    expect(res.body).toEqual([]);
  });
});

// ── GET /burn-buddies/:id/streaks ──────────────────────────────────────────────

describe('GET /burn-buddies/:id/streaks', () => {
  it('returns 401 when unauthenticated', async () => {
    const res = await request(buildApp()).get(`/burn-buddies/${BURN_BUDDY_ID}/streaks`);
    expect(res.status).toBe(401);
  });

  it('returns 404 when the burn buddy does not exist', async () => {
    mockBBDocGet.mockResolvedValueOnce({ exists: false });

    const res = await request(buildApp())
      .get(`/burn-buddies/${BURN_BUDDY_ID}/streaks`)
      .set('Authorization', VALID_TOKEN);

    expect(res.status).toBe(404);
  });

  it('returns 403 when user is not a member of the Burn Buddy', async () => {
    mockBBDocGet.mockResolvedValueOnce({
      exists: true,
      data: () => ({ id: BURN_BUDDY_ID, uid1: 'other-1', uid2: 'other-2', createdAt: '' }),
    });

    const res = await request(buildApp())
      .get(`/burn-buddies/${BURN_BUDDY_ID}/streaks`)
      .set('Authorization', VALID_TOKEN);

    expect(res.status).toBe(403);
  });

  it('returns burnStreak and supernovaStreak when no group workouts exist', async () => {
    mockBBDocGet.mockResolvedValueOnce({
      exists: true,
      data: () => ({ id: BURN_BUDDY_ID, uid1: TEST_UID, uid2: OTHER_UID, createdAt: '' }),
    });
    mockGroupWorkoutsQueryGet.mockResolvedValueOnce({ docs: [] });

    const res = await request(buildApp())
      .get(`/burn-buddies/${BURN_BUDDY_ID}/streaks`)
      .set('Authorization', VALID_TOKEN);

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ burnStreak: 0, supernovaStreak: 0 });
  });

  it('returns streak counts based on group workouts', async () => {
    mockBBDocGet.mockResolvedValueOnce({
      exists: true,
      data: () => ({ id: BURN_BUDDY_ID, uid1: TEST_UID, uid2: OTHER_UID, createdAt: '' }),
    });
    const today = new Date().toISOString().substring(0, 10);
    const gw = {
      id: 'gw-1',
      type: 'buddy',
      referenceId: BURN_BUDDY_ID,
      memberUids: [TEST_UID, OTHER_UID],
      startedAt: `${today}T10:00:00.000Z`,
      workoutIds: ['w1', 'w2'],
    };
    mockGroupWorkoutsQueryGet.mockResolvedValueOnce({ docs: [{ data: () => gw }] });

    const res = await request(buildApp())
      .get(`/burn-buddies/${BURN_BUDDY_ID}/streaks`)
      .set('Authorization', VALID_TOKEN);

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ burnStreak: 1, supernovaStreak: 1 });
  });
});

// ── GET /burn-buddies/:id/stats ───────────────────────────────────────────────

describe('GET /burn-buddies/:id/stats', () => {
  it('returns 401 when unauthenticated', async () => {
    const res = await request(buildApp()).get(`/burn-buddies/${BURN_BUDDY_ID}/stats`);
    expect(res.status).toBe(401);
  });

  it('returns 404 when the burn buddy does not exist', async () => {
    mockBBDocGet.mockResolvedValueOnce({ exists: false });

    const res = await request(buildApp())
      .get(`/burn-buddies/${BURN_BUDDY_ID}/stats`)
      .set('Authorization', VALID_TOKEN);

    expect(res.status).toBe(404);
  });

  it('returns 403 when user is not a member of the Burn Buddy', async () => {
    mockBBDocGet.mockResolvedValueOnce({
      exists: true,
      data: () => ({ id: BURN_BUDDY_ID, uid1: 'other-1', uid2: 'other-2', createdAt: '' }),
    });

    const res = await request(buildApp())
      .get(`/burn-buddies/${BURN_BUDDY_ID}/stats`)
      .set('Authorization', VALID_TOKEN);

    expect(res.status).toBe(403);
  });

  it('returns empty stats when no group workouts exist', async () => {
    mockBBDocGet.mockResolvedValueOnce({
      exists: true,
      data: () => ({ id: BURN_BUDDY_ID, uid1: TEST_UID, uid2: OTHER_UID, createdAt: '' }),
    });
    mockGroupWorkoutsQueryGet.mockResolvedValueOnce({ docs: [] });

    const res = await request(buildApp())
      .get(`/burn-buddies/${BURN_BUDDY_ID}/stats`)
      .set('Authorization', VALID_TOKEN);

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      highestStreakEver: { value: 0, date: '' },
      firstGroupWorkoutDate: null,
      groupWorkoutsAllTime: 0,
      groupWorkoutsThisMonth: 0,
    });
  });

  it('returns correct stats when group workouts exist', async () => {
    mockBBDocGet.mockResolvedValueOnce({
      exists: true,
      data: () => ({ id: BURN_BUDDY_ID, uid1: TEST_UID, uid2: OTHER_UID, createdAt: '' }),
    });

    const now = new Date();
    const thisMonth = `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, '0')}`;
    const gw1 = {
      id: 'gw-1',
      type: 'buddy',
      referenceId: BURN_BUDDY_ID,
      memberUids: [TEST_UID, OTHER_UID],
      startedAt: `${thisMonth}-01T10:00:00.000Z`,
      workoutIds: ['w1', 'w2'],
    };
    const gw2 = {
      id: 'gw-2',
      type: 'buddy',
      referenceId: BURN_BUDDY_ID,
      memberUids: [TEST_UID, OTHER_UID],
      startedAt: `${thisMonth}-02T10:00:00.000Z`,
      workoutIds: ['w3', 'w4'],
    };

    mockGroupWorkoutsQueryGet.mockResolvedValueOnce({
      docs: [{ data: () => gw1 }, { data: () => gw2 }],
    });

    const res = await request(buildApp())
      .get(`/burn-buddies/${BURN_BUDDY_ID}/stats`)
      .set('Authorization', VALID_TOKEN);

    expect(res.status).toBe(200);
    expect(res.body.highestStreakEver.value).toBe(2);
    expect(res.body.firstGroupWorkoutDate).toBe(`${thisMonth}-01T10:00:00.000Z`);
    expect(res.body.groupWorkoutsAllTime).toBe(2);
    expect(res.body.groupWorkoutsThisMonth).toBe(2);
  });
});

// ── GET /burn-buddies/:id/group-workouts ───────────────────────────────────────

describe('GET /burn-buddies/:id/group-workouts', () => {
  it('returns 401 when unauthenticated', async () => {
    const res = await request(buildApp()).get(`/burn-buddies/${BURN_BUDDY_ID}/group-workouts`);
    expect(res.status).toBe(401);
  });

  it('returns 404 when the burn buddy does not exist', async () => {
    mockBBDocGet.mockResolvedValueOnce({ exists: false });

    const res = await request(buildApp())
      .get(`/burn-buddies/${BURN_BUDDY_ID}/group-workouts`)
      .set('Authorization', VALID_TOKEN);

    expect(res.status).toBe(404);
  });

  it('returns 403 when user is not a member of the Burn Buddy', async () => {
    mockBBDocGet.mockResolvedValueOnce({
      exists: true,
      data: () => ({ id: BURN_BUDDY_ID, uid1: 'other-1', uid2: 'other-2', createdAt: '' }),
    });

    const res = await request(buildApp())
      .get(`/burn-buddies/${BURN_BUDDY_ID}/group-workouts`)
      .set('Authorization', VALID_TOKEN);

    expect(res.status).toBe(403);
  });

  it('returns empty array when no group workouts exist', async () => {
    mockBBDocGet.mockResolvedValueOnce({
      exists: true,
      data: () => ({ id: BURN_BUDDY_ID, uid1: TEST_UID, uid2: OTHER_UID, createdAt: '' }),
    });
    mockGroupWorkoutsQueryGet.mockResolvedValueOnce({ docs: [] });

    const res = await request(buildApp())
      .get(`/burn-buddies/${BURN_BUDDY_ID}/group-workouts`)
      .set('Authorization', VALID_TOKEN);

    expect(res.status).toBe(200);
    expect(res.body).toEqual([]);
  });

  it('returns group workouts scoped to the burn buddy', async () => {
    mockBBDocGet.mockResolvedValueOnce({
      exists: true,
      data: () => ({ id: BURN_BUDDY_ID, uid1: TEST_UID, uid2: OTHER_UID, createdAt: '' }),
    });
    const gw1 = {
      id: 'gw-1',
      type: 'buddy',
      referenceId: BURN_BUDDY_ID,
      memberUids: [TEST_UID, OTHER_UID],
      startedAt: '2026-03-01T10:00:00.000Z',
      workoutIds: ['w1', 'w2'],
    };
    const gw2 = {
      id: 'gw-2',
      type: 'buddy',
      referenceId: BURN_BUDDY_ID,
      memberUids: [TEST_UID, OTHER_UID],
      startedAt: '2026-03-02T10:00:00.000Z',
      workoutIds: ['w3', 'w4'],
    };
    mockGroupWorkoutsQueryGet.mockResolvedValueOnce({
      docs: [{ data: () => gw1 }, { data: () => gw2 }],
    });

    const res = await request(buildApp())
      .get(`/burn-buddies/${BURN_BUDDY_ID}/group-workouts`)
      .set('Authorization', VALID_TOKEN);

    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(2);
    expect(res.body[0]).toMatchObject({ id: 'gw-1', referenceId: BURN_BUDDY_ID });
    expect(res.body[1]).toMatchObject({ id: 'gw-2', referenceId: BURN_BUDDY_ID });
  });
});

// ── GET /burn-buddies/:id ──────────────────────────────────────────────────────

describe('GET /burn-buddies/:id', () => {
  it('returns 401 when unauthenticated', async () => {
    const res = await request(buildApp()).get(`/burn-buddies/${BURN_BUDDY_ID}`);
    expect(res.status).toBe(401);
  });

  it('returns 404 when the burn buddy does not exist', async () => {
    mockBBDocGet.mockResolvedValueOnce({ exists: false });

    const res = await request(buildApp())
      .get(`/burn-buddies/${BURN_BUDDY_ID}`)
      .set('Authorization', VALID_TOKEN);

    expect(res.status).toBe(404);
  });

  it('returns 403 when user is not a member', async () => {
    mockBBDocGet.mockResolvedValueOnce({
      exists: true,
      data: () => ({ id: BURN_BUDDY_ID, uid1: 'other-1', uid2: 'other-2', createdAt: '' }),
    });

    const res = await request(buildApp())
      .get(`/burn-buddies/${BURN_BUDDY_ID}`)
      .set('Authorization', VALID_TOKEN);

    expect(res.status).toBe(403);
  });

  it('returns the burn buddy when user is a member', async () => {
    const bb = { id: BURN_BUDDY_ID, uid1: TEST_UID, uid2: OTHER_UID, createdAt: '2026-01-01T00:00:00.000Z' };
    mockBBDocGet.mockResolvedValueOnce({ exists: true, data: () => bb });

    const res = await request(buildApp())
      .get(`/burn-buddies/${BURN_BUDDY_ID}`)
      .set('Authorization', VALID_TOKEN);

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ id: BURN_BUDDY_ID, uid1: TEST_UID, uid2: OTHER_UID });
  });
});

// ── PUT /burn-buddies/:id ──────────────────────────────────────────────────────

describe('PUT /burn-buddies/:id', () => {
  it('returns 401 when unauthenticated', async () => {
    const res = await request(buildApp()).put(`/burn-buddies/${BURN_BUDDY_ID}`);
    expect(res.status).toBe(401);
  });

  it('returns 404 when the burn buddy does not exist', async () => {
    mockBBDocGet.mockResolvedValueOnce({ exists: false });

    const res = await request(buildApp())
      .put(`/burn-buddies/${BURN_BUDDY_ID}`)
      .set('Authorization', VALID_TOKEN)
      .send({ workoutSchedule: { days: ['Mon', 'Wed'], time: '07:00' } });

    expect(res.status).toBe(404);
  });

  it('returns 403 when user is not a member', async () => {
    mockBBDocGet.mockResolvedValueOnce({
      exists: true,
      data: () => ({ id: BURN_BUDDY_ID, uid1: 'other-1', uid2: 'other-2', createdAt: '' }),
    });

    const res = await request(buildApp())
      .put(`/burn-buddies/${BURN_BUDDY_ID}`)
      .set('Authorization', VALID_TOKEN)
      .send({ workoutSchedule: { days: ['Mon'], time: '08:00' } });

    expect(res.status).toBe(403);
  });

  it('updates the workout schedule and returns the updated burn buddy', async () => {
    const bb = { id: BURN_BUDDY_ID, uid1: TEST_UID, uid2: OTHER_UID, createdAt: '2026-01-01T00:00:00.000Z' };
    mockBBDocGet.mockResolvedValueOnce({ exists: true, data: () => bb });
    mockBBDocUpdate.mockResolvedValueOnce(undefined);

    const schedule = { days: ['Mon', 'Wed', 'Fri'], time: '07:00' };
    const res = await request(buildApp())
      .put(`/burn-buddies/${BURN_BUDDY_ID}`)
      .set('Authorization', VALID_TOKEN)
      .send({ workoutSchedule: schedule });

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ id: BURN_BUDDY_ID, workoutSchedule: schedule });
    expect(mockBBDocUpdate).toHaveBeenCalledWith({ workoutSchedule: schedule });
  });
});

// ── DELETE /burn-buddies/:id ───────────────────────────────────────────────────

describe('DELETE /burn-buddies/:id', () => {
  it('returns 401 when unauthenticated', async () => {
    const res = await request(buildApp()).delete(`/burn-buddies/${BURN_BUDDY_ID}`);
    expect(res.status).toBe(401);
  });

  it('returns 404 when the burn buddy does not exist', async () => {
    mockBBDocGet.mockResolvedValueOnce({ exists: false });

    const res = await request(buildApp())
      .delete(`/burn-buddies/${BURN_BUDDY_ID}`)
      .set('Authorization', VALID_TOKEN);

    expect(res.status).toBe(404);
  });

  it('returns 403 when user is not a member of the Burn Buddy', async () => {
    mockBBDocGet.mockResolvedValueOnce({
      exists: true,
      data: () => ({ id: BURN_BUDDY_ID, uid1: 'other-1', uid2: 'other-2', createdAt: '' }),
    });

    const res = await request(buildApp())
      .delete(`/burn-buddies/${BURN_BUDDY_ID}`)
      .set('Authorization', VALID_TOKEN);

    expect(res.status).toBe(403);
  });

  it('deletes the burn buddy and returns 204', async () => {
    mockBBDocGet.mockResolvedValueOnce({
      exists: true,
      data: () => ({ id: BURN_BUDDY_ID, uid1: TEST_UID, uid2: OTHER_UID, createdAt: '' }),
    });
    mockBBDocDelete.mockResolvedValueOnce(undefined);

    const res = await request(buildApp())
      .delete(`/burn-buddies/${BURN_BUDDY_ID}`)
      .set('Authorization', VALID_TOKEN);

    expect(res.status).toBe(204);
    expect(mockBBDocDelete).toHaveBeenCalledOnce();
  });
});

// ── GET /burn-buddies/:id/calendar ─────────────────────────────────────────────

describe('GET /burn-buddies/:id/calendar', () => {
  const PARTNER_NAME = 'Jane Doe';

  it('returns 401 when unauthenticated', async () => {
    const res = await request(buildApp()).get(`/burn-buddies/${BURN_BUDDY_ID}/calendar`);
    expect(res.status).toBe(401);
  });

  it('returns 404 when burn buddy not found', async () => {
    mockBBDocGet.mockResolvedValueOnce({ exists: false });

    const res = await request(buildApp())
      .get(`/burn-buddies/${BURN_BUDDY_ID}/calendar`)
      .set('Authorization', VALID_TOKEN);

    expect(res.status).toBe(404);
  });

  it('returns 404 when user is not a member', async () => {
    mockBBDocGet.mockResolvedValueOnce({
      exists: true,
      data: () => ({
        id: BURN_BUDDY_ID,
        uid1: 'other-user-1',
        uid2: 'other-user-2',
        workoutSchedule: { days: ['Mon', 'Wed'] },
        createdAt: '2026-01-01T00:00:00.000Z',
      }),
    });

    const res = await request(buildApp())
      .get(`/burn-buddies/${BURN_BUDDY_ID}/calendar`)
      .set('Authorization', VALID_TOKEN);

    expect(res.status).toBe(404);
  });

  it('returns 400 when no workout schedule is configured', async () => {
    mockBBDocGet.mockResolvedValueOnce({
      exists: true,
      data: () => ({
        id: BURN_BUDDY_ID,
        uid1: TEST_UID,
        uid2: OTHER_UID,
        createdAt: '2026-01-01T00:00:00.000Z',
      }),
    });

    const res = await request(buildApp())
      .get(`/burn-buddies/${BURN_BUDDY_ID}/calendar`)
      .set('Authorization', VALID_TOKEN);

    expect(res.status).toBe(400);
    expect(res.body).toMatchObject({ error: expect.stringContaining('schedule') });
  });

  it('returns 400 when workout schedule has empty days', async () => {
    mockBBDocGet.mockResolvedValueOnce({
      exists: true,
      data: () => ({
        id: BURN_BUDDY_ID,
        uid1: TEST_UID,
        uid2: OTHER_UID,
        workoutSchedule: { days: [] },
        createdAt: '2026-01-01T00:00:00.000Z',
      }),
    });

    const res = await request(buildApp())
      .get(`/burn-buddies/${BURN_BUDDY_ID}/calendar`)
      .set('Authorization', VALID_TOKEN);

    expect(res.status).toBe(400);
    expect(res.body).toMatchObject({ error: expect.stringContaining('schedule') });
  });

  it('returns .ics file with timed events when schedule has time', async () => {
    mockBBDocGet.mockResolvedValueOnce({
      exists: true,
      data: () => ({
        id: BURN_BUDDY_ID,
        uid1: TEST_UID,
        uid2: OTHER_UID,
        workoutSchedule: { days: ['Mon', 'Wed', 'Fri'], time: '07:00' },
        createdAt: '2026-01-01T00:00:00.000Z',
      }),
    });
    mockUsersDocGet.mockResolvedValueOnce({
      exists: true,
      data: () => ({ uid: OTHER_UID, displayName: PARTNER_NAME, email: 'jane@test.com' }),
    });

    const res = await request(buildApp())
      .get(`/burn-buddies/${BURN_BUDDY_ID}/calendar`)
      .set('Authorization', VALID_TOKEN);

    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toContain('text/calendar');
    expect(res.headers['content-disposition']).toBe('attachment; filename="burnbuddy-workout.ics"');

    const body = res.text;
    expect(body).toContain('BEGIN:VCALENDAR');
    expect(body).toContain('END:VCALENDAR');
    expect(body).toContain(`SUMMARY:🔥 Workout with ${PARTNER_NAME}`);
    expect(body).toContain('RRULE:FREQ=WEEKLY;BYDAY=MO,WE,FR');
    expect(body).toContain('DTSTART:');
    expect(body).toContain('DTEND:');
    expect(body).toContain('TRIGGER:-PT30M');
  });

  it('returns .ics file with all-day events when schedule has no time', async () => {
    mockBBDocGet.mockResolvedValueOnce({
      exists: true,
      data: () => ({
        id: BURN_BUDDY_ID,
        uid1: TEST_UID,
        uid2: OTHER_UID,
        workoutSchedule: { days: ['Tue', 'Thu'] },
        createdAt: '2026-01-01T00:00:00.000Z',
      }),
    });
    mockUsersDocGet.mockResolvedValueOnce({
      exists: true,
      data: () => ({ uid: OTHER_UID, displayName: PARTNER_NAME, email: 'jane@test.com' }),
    });

    const res = await request(buildApp())
      .get(`/burn-buddies/${BURN_BUDDY_ID}/calendar`)
      .set('Authorization', VALID_TOKEN);

    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toContain('text/calendar');

    const body = res.text;
    expect(body).toContain('BEGIN:VCALENDAR');
    expect(body).toContain(`SUMMARY:🔥 Workout with ${PARTNER_NAME}`);
    expect(body).toContain('RRULE:FREQ=WEEKLY;BYDAY=TU,TH');
    expect(body).toContain('DTSTART;VALUE=DATE:');
  });

  it('falls back to "Buddy" when partner user doc not found', async () => {
    mockBBDocGet.mockResolvedValueOnce({
      exists: true,
      data: () => ({
        id: BURN_BUDDY_ID,
        uid1: TEST_UID,
        uid2: OTHER_UID,
        workoutSchedule: { days: ['Mon'] },
        createdAt: '2026-01-01T00:00:00.000Z',
      }),
    });
    mockUsersDocGet.mockResolvedValueOnce({ exists: false });

    const res = await request(buildApp())
      .get(`/burn-buddies/${BURN_BUDDY_ID}/calendar`)
      .set('Authorization', VALID_TOKEN);

    expect(res.status).toBe(200);
    expect(res.text).toContain('SUMMARY:🔥 Workout with Buddy');
  });
});
