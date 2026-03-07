import { describe, it, expect, vi, beforeEach } from 'vitest';
import express from 'express';
import request from 'supertest';

// vi.hoisted ensures mock variables are created before the mock factory runs
const {
  mockVerifyIdToken,
  // friendRequests collection — doc-based operations
  mockFrRequestDocGet,
  mockFrRequestDocSet,
  mockFrRequestDocUpdate,
  mockFrRequestDocRef,
  // friendRequests collection — query-based operations
  mockFrRequestQueryGet,
  mockFrRequestQueryChain,
  // friends collection — doc-based operations
  mockFriendDocGet,
  mockFriendDocSet,
  mockFriendDocDelete,
  mockFriendDocRef,
  // friends collection — query-based operations (GET /friends)
  mockFriendsQueryGet,
  mockFriendsQueryChain,
  // users collection — query-based operations
  mockUsersQueryGet,
  mockUsersQueryChain,
  // users collection — doc-based operations (GET /friends profile enrichment)
  mockUsersDocGet,
  mockUsersDocRef,
  // db.getAll() for batched profile fetches
  mockGetAll,
} = vi.hoisted(() => {
  const mockVerifyIdToken = vi.fn();

  // friendRequests — doc operations
  const mockFrRequestDocGet = vi.fn();
  const mockFrRequestDocSet = vi.fn();
  const mockFrRequestDocUpdate = vi.fn();
  const mockFrRequestDocRef = vi.fn(() => ({
    get: mockFrRequestDocGet,
    set: mockFrRequestDocSet,
    update: mockFrRequestDocUpdate,
  }));

  // friendRequests — query chain
  const mockFrRequestQueryGet = vi.fn();
  const mockFrRequestQueryChain = {
    where: vi.fn(),
    limit: vi.fn(),
    get: mockFrRequestQueryGet,
  };

  // friends — doc operations
  const mockFriendDocGet = vi.fn();
  const mockFriendDocSet = vi.fn();
  const mockFriendDocDelete = vi.fn();
  const mockFriendDocRef = vi.fn(() => ({
    get: mockFriendDocGet,
    set: mockFriendDocSet,
    delete: mockFriendDocDelete,
  }));

  // friends — query chain (GET /friends)
  const mockFriendsQueryGet = vi.fn();
  const mockFriendsQueryChain = {
    where: vi.fn(),
    get: mockFriendsQueryGet,
  };

  // users — query chain
  const mockUsersQueryGet = vi.fn();
  const mockUsersQueryChain = {
    where: vi.fn(),
    limit: vi.fn(),
    get: mockUsersQueryGet,
  };

  // users — doc operations (profile enrichment for GET /friends)
  const mockUsersDocGet = vi.fn();
  const mockUsersDocRef = vi.fn(() => ({ get: mockUsersDocGet }));

  // db.getAll() for batched profile fetches
  const mockGetAll = vi.fn();

  return {
    mockVerifyIdToken,
    mockFrRequestDocGet,
    mockFrRequestDocSet,
    mockFrRequestDocUpdate,
    mockFrRequestDocRef,
    mockFrRequestQueryGet,
    mockFrRequestQueryChain,
    mockFriendDocGet,
    mockFriendDocSet,
    mockFriendDocDelete,
    mockFriendDocRef,
    mockFriendsQueryGet,
    mockFriendsQueryChain,
    mockUsersQueryGet,
    mockUsersQueryChain,
    mockUsersDocGet,
    mockUsersDocRef,
    mockGetAll,
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
      if (name === 'friendRequests') {
        return {
          doc: mockFrRequestDocRef,
          where: () => mockFrRequestQueryChain,
        };
      }
      if (name === 'friends') {
        return { doc: mockFriendDocRef, where: () => mockFriendsQueryChain };
      }
      if (name === 'users') {
        return { where: () => mockUsersQueryChain, doc: mockUsersDocRef };
      }
      return {};
    },
    getAll: mockGetAll,
  }),
}));

import friendsRouter from './friends';
import usersRouter from './users';

function buildApp() {
  const app = express();
  app.use(express.json());
  app.use('/friends', friendsRouter);
  app.use('/users', usersRouter);
  return app;
}

const VALID_TOKEN = 'Bearer valid.token';
const TEST_UID = 'user-abc-123';
const OTHER_UID = 'user-xyz-456';

beforeEach(() => {
  vi.resetAllMocks();

  // Re-setup auth mock
  mockVerifyIdToken.mockResolvedValue({ uid: TEST_UID });

  // Re-setup query chain to be chainable (mockReturnThis must be re-applied after resetAllMocks)
  mockFrRequestQueryChain.where.mockReturnThis();
  mockFrRequestQueryChain.limit.mockReturnThis();
  mockUsersQueryChain.where.mockReturnThis();
  mockUsersQueryChain.limit.mockReturnThis();
  mockFriendsQueryChain.where.mockReturnThis();

  // Re-setup doc refs to return their operation fns
  mockFrRequestDocRef.mockImplementation(() => ({
    get: mockFrRequestDocGet,
    set: mockFrRequestDocSet,
    update: mockFrRequestDocUpdate,
  }));
  mockFriendDocRef.mockImplementation(() => ({
    get: mockFriendDocGet,
    set: mockFriendDocSet,
    delete: mockFriendDocDelete,
  }));
  mockUsersDocRef.mockImplementation(() => ({ get: mockUsersDocGet }));
});

// ── GET /users/search ──────────────────────────────────────────────────────────

describe('GET /users/search', () => {
  it('returns 401 when unauthenticated', async () => {
    const res = await request(buildApp()).get('/users/search?email=test@example.com');
    expect(res.status).toBe(401);
  });

  it('returns 400 when neither q nor email query param is provided', async () => {
    const res = await request(buildApp()).get('/users/search').set('Authorization', VALID_TOKEN);
    expect(res.status).toBe(400);
    expect(res.body).toMatchObject({ error: expect.stringContaining('2 characters') });
  });

  it('returns 404 when no user matches the email', async () => {
    mockUsersQueryGet.mockResolvedValueOnce({ empty: true, docs: [] });

    const res = await request(buildApp())
      .get('/users/search?email=notfound@example.com')
      .set('Authorization', VALID_TOKEN);

    expect(res.status).toBe(404);
  });

  it('returns uid, displayName, email for matching user', async () => {
    const profile = { uid: OTHER_UID, displayName: 'Other User', email: 'other@example.com' };
    mockUsersQueryGet.mockResolvedValueOnce({
      empty: false,
      docs: [{ data: () => profile }],
    });

    const res = await request(buildApp())
      .get('/users/search?email=other@example.com')
      .set('Authorization', VALID_TOKEN);

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ uid: OTHER_UID, displayName: 'Other User', email: 'other@example.com' });
  });
});

// ── POST /friends/requests ─────────────────────────────────────────────────────

describe('POST /friends/requests', () => {
  it('returns 401 when unauthenticated', async () => {
    const res = await request(buildApp()).post('/friends/requests');
    expect(res.status).toBe(401);
  });

  it('returns 400 when toUid is missing', async () => {
    const res = await request(buildApp())
      .post('/friends/requests')
      .set('Authorization', VALID_TOKEN)
      .send({});
    expect(res.status).toBe(400);
    expect(res.body).toMatchObject({ error: expect.stringContaining('toUid') });
  });

  it('returns 400 when toUid equals own uid', async () => {
    const res = await request(buildApp())
      .post('/friends/requests')
      .set('Authorization', VALID_TOKEN)
      .send({ toUid: TEST_UID });
    expect(res.status).toBe(400);
    expect(res.body).toMatchObject({ error: expect.stringContaining('yourself') });
  });

  it('returns 409 when a pending request already exists', async () => {
    mockFrRequestQueryGet.mockResolvedValueOnce({ empty: false });

    const res = await request(buildApp())
      .post('/friends/requests')
      .set('Authorization', VALID_TOKEN)
      .send({ toUid: OTHER_UID });

    expect(res.status).toBe(409);
    expect(res.body).toMatchObject({ error: expect.stringContaining('already exists') });
  });

  it('creates and returns a new friend request with 201', async () => {
    mockFrRequestQueryGet.mockResolvedValueOnce({ empty: true });
    mockFrRequestDocSet.mockResolvedValueOnce(undefined);

    const res = await request(buildApp())
      .post('/friends/requests')
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
    expect(mockFrRequestDocSet).toHaveBeenCalledOnce();
  });
});

// ── GET /friends/requests ──────────────────────────────────────────────────────

describe('GET /friends/requests', () => {
  it('returns 401 when unauthenticated', async () => {
    const res = await request(buildApp()).get('/friends/requests');
    expect(res.status).toBe(401);
  });

  it('returns incoming and outgoing pending requests enriched with displayName and photoURL', async () => {
    const incomingReq: Record<string, unknown> = { id: 'req-1', fromUid: OTHER_UID, toUid: TEST_UID, status: 'pending', createdAt: '2026-01-01T00:00:00.000Z' };
    const outgoingReq: Record<string, unknown> = { id: 'req-2', fromUid: TEST_UID, toUid: OTHER_UID, status: 'pending', createdAt: '2026-01-01T00:00:00.000Z' };

    const otherProfile = { uid: OTHER_UID, displayName: 'Other User', profilePictureUrl: 'https://example.com/photo.jpg', email: 'other@example.com', createdAt: '2026-01-01' };

    // First get() call → incoming, second → outgoing
    mockFrRequestQueryGet
      .mockResolvedValueOnce({ docs: [{ data: () => incomingReq }] })
      .mockResolvedValueOnce({ docs: [{ data: () => outgoingReq }] });

    // getAll() returns the user profile for OTHER_UID (deduplicated — same uid in both)
    mockGetAll.mockResolvedValueOnce([
      { exists: true, data: () => otherProfile },
    ]);

    const res = await request(buildApp())
      .get('/friends/requests')
      .set('Authorization', VALID_TOKEN);

    expect(res.status).toBe(200);
    expect(res.body.incoming).toHaveLength(1);
    expect(res.body.outgoing).toHaveLength(1);
    expect(res.body.incoming[0]).toMatchObject({
      id: 'req-1',
      displayName: 'Other User',
      photoURL: 'https://example.com/photo.jpg',
    });
    expect(res.body.outgoing[0]).toMatchObject({
      id: 'req-2',
      displayName: 'Other User',
      photoURL: 'https://example.com/photo.jpg',
    });
    expect(mockGetAll).toHaveBeenCalledOnce();
  });

  it('returns empty arrays when no pending requests exist', async () => {
    mockFrRequestQueryGet
      .mockResolvedValueOnce({ docs: [] })
      .mockResolvedValueOnce({ docs: [] });

    const res = await request(buildApp())
      .get('/friends/requests')
      .set('Authorization', VALID_TOKEN);

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ incoming: [], outgoing: [] });
    // getAll should not be called when there are no UIDs to fetch
    expect(mockGetAll).not.toHaveBeenCalled();
  });

  it('returns fallback displayName when user profile is missing (deleted account)', async () => {
    const incomingReq: Record<string, unknown> = { id: 'req-3', fromUid: 'deleted-user', toUid: TEST_UID, status: 'pending', createdAt: '2026-01-01T00:00:00.000Z' };

    mockFrRequestQueryGet
      .mockResolvedValueOnce({ docs: [{ data: () => incomingReq }] })
      .mockResolvedValueOnce({ docs: [] });

    // getAll returns a non-existent document for deleted user
    mockGetAll.mockResolvedValueOnce([
      { exists: false, data: () => undefined },
    ]);

    const res = await request(buildApp())
      .get('/friends/requests')
      .set('Authorization', VALID_TOKEN);

    expect(res.status).toBe(200);
    expect(res.body.incoming).toHaveLength(1);
    expect(res.body.incoming[0]).toMatchObject({
      id: 'req-3',
      displayName: 'Unknown User',
    });
    expect(res.body.incoming[0].photoURL).toBeUndefined();
  });
});

// ── POST /friends/requests/:id/accept ─────────────────────────────────────────

describe('POST /friends/requests/:id/accept', () => {
  it('returns 401 when unauthenticated', async () => {
    const res = await request(buildApp()).post('/friends/requests/req-1/accept');
    expect(res.status).toBe(401);
  });

  it('returns 404 when the friend request does not exist', async () => {
    mockFrRequestDocGet.mockResolvedValueOnce({ exists: false });

    const res = await request(buildApp())
      .post('/friends/requests/req-1/accept')
      .set('Authorization', VALID_TOKEN);

    expect(res.status).toBe(404);
  });

  it('returns 403 when the request was not sent to the current user', async () => {
    mockFrRequestDocGet.mockResolvedValueOnce({
      exists: true,
      data: () => ({ id: 'req-1', fromUid: OTHER_UID, toUid: 'someone-else', status: 'pending', createdAt: '' }),
    });

    const res = await request(buildApp())
      .post('/friends/requests/req-1/accept')
      .set('Authorization', VALID_TOKEN);

    expect(res.status).toBe(403);
  });

  it('returns 409 when the request is no longer pending', async () => {
    mockFrRequestDocGet.mockResolvedValueOnce({
      exists: true,
      data: () => ({ id: 'req-1', fromUid: OTHER_UID, toUid: TEST_UID, status: 'accepted', createdAt: '' }),
    });

    const res = await request(buildApp())
      .post('/friends/requests/req-1/accept')
      .set('Authorization', VALID_TOKEN);

    expect(res.status).toBe(409);
  });

  it('accepts the request and creates a friendship document', async () => {
    mockFrRequestDocGet.mockResolvedValueOnce({
      exists: true,
      data: () => ({ id: 'req-1', fromUid: OTHER_UID, toUid: TEST_UID, status: 'pending', createdAt: '' }),
    });
    mockFrRequestDocUpdate.mockResolvedValueOnce(undefined);
    mockFriendDocSet.mockResolvedValueOnce(undefined);

    const res = await request(buildApp())
      .post('/friends/requests/req-1/accept')
      .set('Authorization', VALID_TOKEN);

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ success: true, friendRequestId: 'req-1' });
    expect(mockFrRequestDocUpdate).toHaveBeenCalledWith({ status: 'accepted' });
    expect(mockFriendDocSet).toHaveBeenCalledOnce();
  });
});

// ── DELETE /friends/:uid ───────────────────────────────────────────────────────

describe('DELETE /friends/:uid', () => {
  it('returns 401 when unauthenticated', async () => {
    const res = await request(buildApp()).delete(`/friends/${OTHER_UID}`);
    expect(res.status).toBe(401);
  });

  it('returns 404 when the friendship does not exist', async () => {
    mockFriendDocGet.mockResolvedValueOnce({ exists: false });

    const res = await request(buildApp())
      .delete(`/friends/${OTHER_UID}`)
      .set('Authorization', VALID_TOKEN);

    expect(res.status).toBe(404);
  });

  it('deletes the friendship and returns 204', async () => {
    mockFriendDocGet.mockResolvedValueOnce({ exists: true });
    mockFriendDocDelete.mockResolvedValueOnce(undefined);

    const res = await request(buildApp())
      .delete(`/friends/${OTHER_UID}`)
      .set('Authorization', VALID_TOKEN);

    expect(res.status).toBe(204);
    expect(mockFriendDocDelete).toHaveBeenCalledOnce();
  });
});

// ── GET /friends ───────────────────────────────────────────────────────────────

describe('GET /friends', () => {
  it('returns 401 when unauthenticated', async () => {
    const res = await request(buildApp()).get('/friends');
    expect(res.status).toBe(401);
  });

  it('returns an empty array when the user has no friends', async () => {
    mockFriendsQueryGet
      .mockResolvedValueOnce({ docs: [] })
      .mockResolvedValueOnce({ docs: [] });

    const res = await request(buildApp()).get('/friends').set('Authorization', VALID_TOKEN);

    expect(res.status).toBe(200);
    expect(res.body).toEqual([]);
  });

  it('returns enriched friend list with displayName and email', async () => {
    const friendDoc = { uid1: TEST_UID, uid2: OTHER_UID, createdAt: '2026-01-01T00:00:00.000Z' };
    const otherProfile = { uid: OTHER_UID, displayName: 'Other User', email: 'other@example.com', createdAt: '2026-01-01T00:00:00.000Z' };

    // uid1 query returns one friend; uid2 query returns empty
    mockFriendsQueryGet
      .mockResolvedValueOnce({ docs: [{ data: () => friendDoc }] })
      .mockResolvedValueOnce({ docs: [] });

    // user profile lookup for OTHER_UID
    mockUsersDocGet.mockResolvedValueOnce({ exists: true, data: () => otherProfile });

    const res = await request(buildApp()).get('/friends').set('Authorization', VALID_TOKEN);

    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(1);
    expect(res.body[0]).toMatchObject({ uid: OTHER_UID, displayName: 'Other User', email: 'other@example.com' });
  });

  it('skips friends whose profiles no longer exist', async () => {
    const friendDoc = { uid1: TEST_UID, uid2: OTHER_UID, createdAt: '2026-01-01T00:00:00.000Z' };

    mockFriendsQueryGet
      .mockResolvedValueOnce({ docs: [{ data: () => friendDoc }] })
      .mockResolvedValueOnce({ docs: [] });

    // profile does not exist
    mockUsersDocGet.mockResolvedValueOnce({ exists: false });

    const res = await request(buildApp()).get('/friends').set('Authorization', VALID_TOKEN);

    expect(res.status).toBe(200);
    expect(res.body).toEqual([]);
  });

  it('returns friends found via uid2 query (current user is uid2)', async () => {
    const friendDoc = { uid1: OTHER_UID, uid2: TEST_UID, createdAt: '2026-01-01T00:00:00.000Z' };
    const otherProfile = { uid: OTHER_UID, displayName: 'Other User', email: 'other@example.com', createdAt: '2026-01-01T00:00:00.000Z' };

    // uid1 query returns empty; uid2 query returns one friend
    mockFriendsQueryGet
      .mockResolvedValueOnce({ docs: [] })
      .mockResolvedValueOnce({ docs: [{ data: () => friendDoc }] });

    mockUsersDocGet.mockResolvedValueOnce({ exists: true, data: () => otherProfile });

    const res = await request(buildApp()).get('/friends').set('Authorization', VALID_TOKEN);

    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(1);
    expect(res.body[0].uid).toBe(OTHER_UID);
  });
});
