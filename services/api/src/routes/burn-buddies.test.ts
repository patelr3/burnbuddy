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
  mockBBDocRef,
  // burnBuddies — query
  mockBBQueryGet,
  mockBBQueryChain,
  // friends — doc (friendship check)
  mockFriendsDocGet,
  mockFriendsDocRef,
  // workouts — query (for streaks)
  mockWorkoutsQueryGet,
  mockWorkoutsQueryChain,
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
  const mockBBDocRef = vi.fn(() => ({
    get: mockBBDocGet,
    set: mockBBDocSet,
    delete: mockBBDocDelete,
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

  // workouts — query chain (for streaks endpoint)
  const mockWorkoutsQueryGet = vi.fn();
  const mockWorkoutsQueryChain = {
    where: vi.fn(),
    get: mockWorkoutsQueryGet,
  };

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
    mockBBDocRef,
    mockBBQueryGet,
    mockBBQueryChain,
    mockFriendsDocGet,
    mockFriendsDocRef,
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
  }));
  mockFriendsDocRef.mockImplementation(() => ({ get: mockFriendsDocGet }));
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

  it('returns burnStreak and supernovaStreak when no workouts exist', async () => {
    mockBBDocGet.mockResolvedValueOnce({
      exists: true,
      data: () => ({ id: BURN_BUDDY_ID, uid1: TEST_UID, uid2: OTHER_UID, createdAt: '' }),
    });
    // Both member queries return empty
    mockWorkoutsQueryGet
      .mockResolvedValueOnce({ docs: [] })
      .mockResolvedValueOnce({ docs: [] });

    const res = await request(buildApp())
      .get(`/burn-buddies/${BURN_BUDDY_ID}/streaks`)
      .set('Authorization', VALID_TOKEN);

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ burnStreak: 0, supernovaStreak: 0 });
  });

  it('returns streak counts based on completed workouts', async () => {
    mockBBDocGet.mockResolvedValueOnce({
      exists: true,
      data: () => ({ id: BURN_BUDDY_ID, uid1: TEST_UID, uid2: OTHER_UID, createdAt: '' }),
    });
    const today = new Date().toISOString().substring(0, 10);
    const workout1 = { id: 'w1', uid: TEST_UID, type: 'Running', startedAt: `${today}T10:00:00.000Z`, endedAt: `${today}T11:00:00.000Z`, status: 'completed' };
    const workout2 = { id: 'w2', uid: OTHER_UID, type: 'Running', startedAt: `${today}T10:00:00.000Z`, endedAt: `${today}T11:00:00.000Z`, status: 'completed' };
    mockWorkoutsQueryGet
      .mockResolvedValueOnce({ docs: [{ data: () => workout1 }] })
      .mockResolvedValueOnce({ docs: [{ data: () => workout2 }] });

    const res = await request(buildApp())
      .get(`/burn-buddies/${BURN_BUDDY_ID}/streaks`)
      .set('Authorization', VALID_TOKEN);

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ burnStreak: 1, supernovaStreak: 1 });
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
