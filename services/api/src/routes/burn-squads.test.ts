import { describe, it, expect, vi, beforeEach } from 'vitest';
import express from 'express';
import request from 'supertest';

// vi.hoisted ensures mock variables are created before the mock factory runs
const {
  mockVerifyIdToken,
  // burnSquads — doc operations
  mockSquadDocGet,
  mockSquadDocSet,
  mockSquadDocUpdate,
  mockSquadDocDelete,
  mockSquadDocRef,
  // burnSquads — query
  mockSquadQueryGet,
  mockSquadQueryChain,
  // burnSquadJoinRequests — doc operations
  mockJoinRequestDocGet,
  mockJoinRequestDocSet,
  mockJoinRequestDocUpdate,
  mockJoinRequestDocRef,
  // friends — doc (friendship check)
  mockFriendsDocGet,
  mockFriendsDocRef,
  // workouts — query (for streaks)
  mockWorkoutsQueryGet,
  mockWorkoutsQueryChain,
  // burnSquadJoinRequests — query (for GET /join-requests)
  mockJoinRequestQueryGet,
  mockJoinRequestQueryChain,
} = vi.hoisted(() => {
  const mockVerifyIdToken = vi.fn();

  // burnSquads — doc
  const mockSquadDocGet = vi.fn();
  const mockSquadDocSet = vi.fn();
  const mockSquadDocUpdate = vi.fn();
  const mockSquadDocDelete = vi.fn();
  const mockSquadDocRef = vi.fn(() => ({
    get: mockSquadDocGet,
    set: mockSquadDocSet,
    update: mockSquadDocUpdate,
    delete: mockSquadDocDelete,
  }));

  // burnSquads — query chain
  const mockSquadQueryGet = vi.fn();
  const mockSquadQueryChain = {
    where: vi.fn(),
    get: mockSquadQueryGet,
  };

  // burnSquadJoinRequests — doc
  const mockJoinRequestDocGet = vi.fn();
  const mockJoinRequestDocSet = vi.fn();
  const mockJoinRequestDocUpdate = vi.fn();
  const mockJoinRequestDocRef = vi.fn(() => ({
    get: mockJoinRequestDocGet,
    set: mockJoinRequestDocSet,
    update: mockJoinRequestDocUpdate,
  }));

  // burnSquadJoinRequests — query chain (for GET /join-requests)
  const mockJoinRequestQueryGet = vi.fn();
  const mockJoinRequestQueryChain = {
    where: vi.fn(),
    get: mockJoinRequestQueryGet,
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
    mockSquadDocGet,
    mockSquadDocSet,
    mockSquadDocUpdate,
    mockSquadDocDelete,
    mockSquadDocRef,
    mockSquadQueryGet,
    mockSquadQueryChain,
    mockJoinRequestDocGet,
    mockJoinRequestDocSet,
    mockJoinRequestDocUpdate,
    mockJoinRequestDocRef,
    mockFriendsDocGet,
    mockFriendsDocRef,
    mockWorkoutsQueryGet,
    mockWorkoutsQueryChain,
    mockJoinRequestQueryGet,
    mockJoinRequestQueryChain,
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
      if (name === 'burnSquads') {
        return {
          doc: mockSquadDocRef,
          where: () => mockSquadQueryChain,
        };
      }
      if (name === 'burnSquadJoinRequests') {
        return {
          doc: mockJoinRequestDocRef,
          where: () => mockJoinRequestQueryChain,
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

import burnSquadsRouter from './burn-squads';

function buildApp() {
  const app = express();
  app.use(express.json());
  app.use('/burn-squads', burnSquadsRouter);
  return app;
}

const VALID_TOKEN = 'Bearer valid.token';
const TEST_UID = 'user-abc-123';
const OTHER_UID = 'user-xyz-456';
const SQUAD_ID = 'squad-id-001';
const REQUEST_ID = 'req-id-001';

const SAMPLE_SQUAD = {
  id: SQUAD_ID,
  name: 'Test Squad',
  adminUid: TEST_UID,
  memberUids: [TEST_UID],
  settings: { onlyAdminsCanAddMembers: false },
  createdAt: '2026-01-01T00:00:00.000Z',
};

beforeEach(() => {
  vi.resetAllMocks();

  // Re-setup auth mock
  mockVerifyIdToken.mockResolvedValue({ uid: TEST_UID });

  // Re-setup query chains (mockReturnThis must be re-applied after resetAllMocks)
  mockSquadQueryChain.where.mockReturnThis();
  mockWorkoutsQueryChain.where.mockReturnThis();
  mockJoinRequestQueryChain.where.mockReturnThis();

  // Re-setup doc refs
  mockSquadDocRef.mockImplementation(() => ({
    get: mockSquadDocGet,
    set: mockSquadDocSet,
    update: mockSquadDocUpdate,
    delete: mockSquadDocDelete,
  }));
  mockJoinRequestDocRef.mockImplementation(() => ({
    get: mockJoinRequestDocGet,
    set: mockJoinRequestDocSet,
    update: mockJoinRequestDocUpdate,
  }));
  mockFriendsDocRef.mockImplementation(() => ({ get: mockFriendsDocGet }));
});

// ── GET /burn-squads/join-requests ────────────────────────────────────────────

describe('GET /burn-squads/join-requests', () => {
  it('returns 401 when unauthenticated', async () => {
    const res = await request(buildApp()).get('/burn-squads/join-requests');
    expect(res.status).toBe(401);
  });

  it('returns empty incoming and outgoing when no pending join requests exist', async () => {
    mockJoinRequestQueryGet
      .mockResolvedValueOnce({ docs: [] }) // incoming
      .mockResolvedValueOnce({ docs: [] }); // outgoing

    const res = await request(buildApp())
      .get('/burn-squads/join-requests')
      .set('Authorization', VALID_TOKEN);

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ incoming: [], outgoing: [] });
  });

  it('returns enriched incoming join requests with squad name', async () => {
    const joinReq = {
      id: REQUEST_ID,
      squadId: SQUAD_ID,
      fromUid: OTHER_UID,
      toUid: TEST_UID,
      status: 'pending',
      createdAt: '2026-01-01T00:00:00.000Z',
    };
    mockJoinRequestQueryGet
      .mockResolvedValueOnce({ docs: [{ data: () => joinReq }] }) // incoming
      .mockResolvedValueOnce({ docs: [] }); // outgoing
    mockSquadDocGet.mockResolvedValueOnce({
      exists: true,
      data: () => SAMPLE_SQUAD,
    });

    const res = await request(buildApp())
      .get('/burn-squads/join-requests')
      .set('Authorization', VALID_TOKEN);

    expect(res.status).toBe(200);
    expect(res.body.incoming).toHaveLength(1);
    expect(res.body.incoming[0]).toMatchObject({
      id: REQUEST_ID,
      squadId: SQUAD_ID,
      squadName: 'Test Squad',
    });
    expect(res.body.outgoing).toHaveLength(0);
  });

  it('returns enriched outgoing join requests with squad name', async () => {
    const joinReq = {
      id: REQUEST_ID,
      squadId: SQUAD_ID,
      fromUid: TEST_UID,
      toUid: OTHER_UID,
      status: 'pending',
      createdAt: '2026-01-01T00:00:00.000Z',
    };
    mockJoinRequestQueryGet
      .mockResolvedValueOnce({ docs: [] }) // incoming
      .mockResolvedValueOnce({ docs: [{ data: () => joinReq }] }); // outgoing
    mockSquadDocGet.mockResolvedValueOnce({
      exists: true,
      data: () => SAMPLE_SQUAD,
    });

    const res = await request(buildApp())
      .get('/burn-squads/join-requests')
      .set('Authorization', VALID_TOKEN);

    expect(res.status).toBe(200);
    expect(res.body.incoming).toHaveLength(0);
    expect(res.body.outgoing).toHaveLength(1);
    expect(res.body.outgoing[0]).toMatchObject({
      id: REQUEST_ID,
      squadName: 'Test Squad',
    });
  });
});

// ── POST /burn-squads ──────────────────────────────────────────────────────────

describe('POST /burn-squads', () => {
  it('returns 401 when unauthenticated', async () => {
    const res = await request(buildApp()).post('/burn-squads');
    expect(res.status).toBe(401);
  });

  it('returns 400 when name is missing', async () => {
    const res = await request(buildApp())
      .post('/burn-squads')
      .set('Authorization', VALID_TOKEN)
      .send({});
    expect(res.status).toBe(400);
    expect(res.body).toMatchObject({ error: expect.stringContaining('name') });
  });

  it('creates a squad with no invite uids', async () => {
    mockSquadDocSet.mockResolvedValueOnce(undefined);

    const res = await request(buildApp())
      .post('/burn-squads')
      .set('Authorization', VALID_TOKEN)
      .send({ name: 'Morning Crew' });

    expect(res.status).toBe(201);
    expect(res.body.squad).toMatchObject({
      name: 'Morning Crew',
      adminUid: TEST_UID,
      memberUids: [TEST_UID],
      settings: { onlyAdminsCanAddMembers: false },
    });
    expect(res.body.squad.id).toBeDefined();
    expect(res.body.joinRequests).toEqual([]);
    expect(mockSquadDocSet).toHaveBeenCalledOnce();
  });

  it('creates a squad and sends join requests to valid friends', async () => {
    mockSquadDocSet.mockResolvedValueOnce(undefined);
    // friendship check for OTHER_UID — exists
    mockFriendsDocGet.mockResolvedValueOnce({ exists: true });
    mockJoinRequestDocSet.mockResolvedValueOnce(undefined);

    const res = await request(buildApp())
      .post('/burn-squads')
      .set('Authorization', VALID_TOKEN)
      .send({ name: 'Morning Crew', inviteUids: [OTHER_UID] });

    expect(res.status).toBe(201);
    expect(res.body.joinRequests).toHaveLength(1);
    expect(res.body.joinRequests[0]).toMatchObject({
      fromUid: TEST_UID,
      toUid: OTHER_UID,
      status: 'pending',
    });
    expect(mockJoinRequestDocSet).toHaveBeenCalledOnce();
  });

  it('skips non-friend invite uids', async () => {
    mockSquadDocSet.mockResolvedValueOnce(undefined);
    // friendship check — not friends
    mockFriendsDocGet.mockResolvedValueOnce({ exists: false });

    const res = await request(buildApp())
      .post('/burn-squads')
      .set('Authorization', VALID_TOKEN)
      .send({ name: 'Morning Crew', inviteUids: [OTHER_UID] });

    expect(res.status).toBe(201);
    expect(res.body.joinRequests).toHaveLength(0);
    expect(mockJoinRequestDocSet).not.toHaveBeenCalled();
  });
});

// ── GET /burn-squads ───────────────────────────────────────────────────────────

describe('GET /burn-squads', () => {
  it('returns 401 when unauthenticated', async () => {
    const res = await request(buildApp()).get('/burn-squads');
    expect(res.status).toBe(401);
  });

  it('returns all squads for the authenticated user', async () => {
    mockSquadQueryGet.mockResolvedValueOnce({
      docs: [{ data: () => SAMPLE_SQUAD }],
    });

    const res = await request(buildApp())
      .get('/burn-squads')
      .set('Authorization', VALID_TOKEN);

    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(1);
    expect(res.body[0].id).toBe(SQUAD_ID);
  });

  it('returns empty array when user is not in any squad', async () => {
    mockSquadQueryGet.mockResolvedValueOnce({ docs: [] });

    const res = await request(buildApp())
      .get('/burn-squads')
      .set('Authorization', VALID_TOKEN);

    expect(res.status).toBe(200);
    expect(res.body).toEqual([]);
  });
});

// ── GET /burn-squads/:id ───────────────────────────────────────────────────────

describe('GET /burn-squads/:id', () => {
  it('returns 401 when unauthenticated', async () => {
    const res = await request(buildApp()).get(`/burn-squads/${SQUAD_ID}`);
    expect(res.status).toBe(401);
  });

  it('returns 404 when the squad does not exist', async () => {
    mockSquadDocGet.mockResolvedValueOnce({ exists: false });

    const res = await request(buildApp())
      .get(`/burn-squads/${SQUAD_ID}`)
      .set('Authorization', VALID_TOKEN);

    expect(res.status).toBe(404);
  });

  it('returns 403 when user is not a member', async () => {
    mockSquadDocGet.mockResolvedValueOnce({
      exists: true,
      data: () => ({ ...SAMPLE_SQUAD, memberUids: [OTHER_UID] }),
    });

    const res = await request(buildApp())
      .get(`/burn-squads/${SQUAD_ID}`)
      .set('Authorization', VALID_TOKEN);

    expect(res.status).toBe(403);
  });

  it('returns the squad when user is a member', async () => {
    mockSquadDocGet.mockResolvedValueOnce({
      exists: true,
      data: () => SAMPLE_SQUAD,
    });

    const res = await request(buildApp())
      .get(`/burn-squads/${SQUAD_ID}`)
      .set('Authorization', VALID_TOKEN);

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ id: SQUAD_ID, name: 'Test Squad', adminUid: TEST_UID });
  });
});

// ── PUT /burn-squads/:id ───────────────────────────────────────────────────────

describe('PUT /burn-squads/:id', () => {
  it('returns 401 when unauthenticated', async () => {
    const res = await request(buildApp()).put(`/burn-squads/${SQUAD_ID}`);
    expect(res.status).toBe(401);
  });

  it('returns 404 when the squad does not exist', async () => {
    mockSquadDocGet.mockResolvedValueOnce({ exists: false });

    const res = await request(buildApp())
      .put(`/burn-squads/${SQUAD_ID}`)
      .set('Authorization', VALID_TOKEN)
      .send({ name: 'New Name' });

    expect(res.status).toBe(404);
  });

  it('returns 403 when user is not the admin', async () => {
    mockSquadDocGet.mockResolvedValueOnce({
      exists: true,
      data: () => ({ ...SAMPLE_SQUAD, adminUid: OTHER_UID }),
    });

    const res = await request(buildApp())
      .put(`/burn-squads/${SQUAD_ID}`)
      .set('Authorization', VALID_TOKEN)
      .send({ name: 'New Name' });

    expect(res.status).toBe(403);
  });

  it('updates squad name and returns updated squad', async () => {
    mockSquadDocGet.mockResolvedValueOnce({
      exists: true,
      data: () => SAMPLE_SQUAD,
    });
    mockSquadDocUpdate.mockResolvedValueOnce(undefined);

    const res = await request(buildApp())
      .put(`/burn-squads/${SQUAD_ID}`)
      .set('Authorization', VALID_TOKEN)
      .send({ name: 'New Squad Name' });

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ id: SQUAD_ID, name: 'New Squad Name' });
    expect(mockSquadDocUpdate).toHaveBeenCalledWith({ name: 'New Squad Name' });
  });

  it('updates settings and merges with existing settings', async () => {
    mockSquadDocGet.mockResolvedValueOnce({
      exists: true,
      data: () => SAMPLE_SQUAD,
    });
    mockSquadDocUpdate.mockResolvedValueOnce(undefined);

    const res = await request(buildApp())
      .put(`/burn-squads/${SQUAD_ID}`)
      .set('Authorization', VALID_TOKEN)
      .send({ settings: { onlyAdminsCanAddMembers: true } });

    expect(res.status).toBe(200);
    expect(mockSquadDocUpdate).toHaveBeenCalledWith({
      settings: { onlyAdminsCanAddMembers: true },
    });
  });
});

// ── POST /burn-squads/:id/join-requests/:requestId/accept ─────────────────────

describe('POST /burn-squads/:id/join-requests/:requestId/accept', () => {
  it('returns 401 when unauthenticated', async () => {
    const res = await request(buildApp()).post(`/burn-squads/${SQUAD_ID}/join-requests/${REQUEST_ID}/accept`);
    expect(res.status).toBe(401);
  });

  it('returns 404 when the join request does not exist', async () => {
    mockJoinRequestDocGet.mockResolvedValueOnce({ exists: false });

    const res = await request(buildApp())
      .post(`/burn-squads/${SQUAD_ID}/join-requests/${REQUEST_ID}/accept`)
      .set('Authorization', VALID_TOKEN);

    expect(res.status).toBe(404);
  });

  it('returns 403 when the request was not sent to the current user', async () => {
    mockJoinRequestDocGet.mockResolvedValueOnce({
      exists: true,
      data: () => ({ id: REQUEST_ID, squadId: SQUAD_ID, fromUid: OTHER_UID, toUid: 'someone-else', status: 'pending', createdAt: '' }),
    });

    const res = await request(buildApp())
      .post(`/burn-squads/${SQUAD_ID}/join-requests/${REQUEST_ID}/accept`)
      .set('Authorization', VALID_TOKEN);

    expect(res.status).toBe(403);
  });

  it('returns 400 when the request belongs to a different squad', async () => {
    mockJoinRequestDocGet.mockResolvedValueOnce({
      exists: true,
      data: () => ({ id: REQUEST_ID, squadId: 'other-squad-id', fromUid: OTHER_UID, toUid: TEST_UID, status: 'pending', createdAt: '' }),
    });

    const res = await request(buildApp())
      .post(`/burn-squads/${SQUAD_ID}/join-requests/${REQUEST_ID}/accept`)
      .set('Authorization', VALID_TOKEN);

    expect(res.status).toBe(400);
  });

  it('returns 409 when the request is no longer pending', async () => {
    mockJoinRequestDocGet.mockResolvedValueOnce({
      exists: true,
      data: () => ({ id: REQUEST_ID, squadId: SQUAD_ID, fromUid: OTHER_UID, toUid: TEST_UID, status: 'accepted', createdAt: '' }),
    });

    const res = await request(buildApp())
      .post(`/burn-squads/${SQUAD_ID}/join-requests/${REQUEST_ID}/accept`)
      .set('Authorization', VALID_TOKEN);

    expect(res.status).toBe(409);
  });

  it('accepts the join request and adds user to squad memberUids', async () => {
    mockJoinRequestDocGet.mockResolvedValueOnce({
      exists: true,
      data: () => ({ id: REQUEST_ID, squadId: SQUAD_ID, fromUid: OTHER_UID, toUid: TEST_UID, status: 'pending', createdAt: '' }),
    });
    mockSquadDocGet.mockResolvedValueOnce({
      exists: true,
      data: () => ({ ...SAMPLE_SQUAD, memberUids: [OTHER_UID] }),
    });
    mockJoinRequestDocUpdate.mockResolvedValueOnce(undefined);
    mockSquadDocUpdate.mockResolvedValueOnce(undefined);

    const res = await request(buildApp())
      .post(`/burn-squads/${SQUAD_ID}/join-requests/${REQUEST_ID}/accept`)
      .set('Authorization', VALID_TOKEN);

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ success: true, squadId: SQUAD_ID, requestId: REQUEST_ID });
    expect(mockJoinRequestDocUpdate).toHaveBeenCalledWith({ status: 'accepted' });
    expect(mockSquadDocUpdate).toHaveBeenCalledWith({ memberUids: [OTHER_UID, TEST_UID] });
  });
});

// ── POST /burn-squads/:id/members ──────────────────────────────────────────────

describe('POST /burn-squads/:id/members', () => {
  it('returns 401 when unauthenticated', async () => {
    const res = await request(buildApp()).post(`/burn-squads/${SQUAD_ID}/members`);
    expect(res.status).toBe(401);
  });

  it('returns 400 when memberUid is missing', async () => {
    const res = await request(buildApp())
      .post(`/burn-squads/${SQUAD_ID}/members`)
      .set('Authorization', VALID_TOKEN)
      .send({});
    expect(res.status).toBe(400);
    expect(res.body).toMatchObject({ error: expect.stringContaining('memberUid') });
  });

  it('returns 404 when the squad does not exist', async () => {
    mockSquadDocGet.mockResolvedValueOnce({ exists: false });

    const res = await request(buildApp())
      .post(`/burn-squads/${SQUAD_ID}/members`)
      .set('Authorization', VALID_TOKEN)
      .send({ memberUid: OTHER_UID });

    expect(res.status).toBe(404);
  });

  it('returns 403 when user is not a member of the squad', async () => {
    mockSquadDocGet.mockResolvedValueOnce({
      exists: true,
      data: () => ({ ...SAMPLE_SQUAD, memberUids: [OTHER_UID] }),
    });

    const res = await request(buildApp())
      .post(`/burn-squads/${SQUAD_ID}/members`)
      .set('Authorization', VALID_TOKEN)
      .send({ memberUid: 'third-user' });

    expect(res.status).toBe(403);
    expect(res.body).toMatchObject({ error: expect.stringContaining('not a member') });
  });

  it('returns 403 when onlyAdminsCanAddMembers and user is not admin', async () => {
    mockSquadDocGet.mockResolvedValueOnce({
      exists: true,
      data: () => ({
        ...SAMPLE_SQUAD,
        adminUid: OTHER_UID,
        memberUids: [TEST_UID, OTHER_UID],
        settings: { onlyAdminsCanAddMembers: true },
      }),
    });

    const res = await request(buildApp())
      .post(`/burn-squads/${SQUAD_ID}/members`)
      .set('Authorization', VALID_TOKEN)
      .send({ memberUid: 'third-user' });

    expect(res.status).toBe(403);
    expect(res.body).toMatchObject({ error: expect.stringContaining('Only admins') });
  });

  it('returns 400 when not friends with the user to add', async () => {
    mockSquadDocGet.mockResolvedValueOnce({
      exists: true,
      data: () => SAMPLE_SQUAD,
    });
    mockFriendsDocGet.mockResolvedValueOnce({ exists: false });

    const res = await request(buildApp())
      .post(`/burn-squads/${SQUAD_ID}/members`)
      .set('Authorization', VALID_TOKEN)
      .send({ memberUid: OTHER_UID });

    expect(res.status).toBe(400);
    expect(res.body).toMatchObject({ error: expect.stringContaining('friends') });
  });

  it('sends a join request successfully', async () => {
    mockSquadDocGet.mockResolvedValueOnce({
      exists: true,
      data: () => SAMPLE_SQUAD,
    });
    mockFriendsDocGet.mockResolvedValueOnce({ exists: true });
    mockJoinRequestDocSet.mockResolvedValueOnce(undefined);

    const res = await request(buildApp())
      .post(`/burn-squads/${SQUAD_ID}/members`)
      .set('Authorization', VALID_TOKEN)
      .send({ memberUid: OTHER_UID });

    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({
      squadId: SQUAD_ID,
      fromUid: TEST_UID,
      toUid: OTHER_UID,
      status: 'pending',
    });
    expect(mockJoinRequestDocSet).toHaveBeenCalledOnce();
  });
});

// ── PUT /burn-squads/:id/settings ─────────────────────────────────────────────

describe('PUT /burn-squads/:id/settings', () => {
  it('returns 401 when unauthenticated', async () => {
    const res = await request(buildApp()).put(`/burn-squads/${SQUAD_ID}/settings`);
    expect(res.status).toBe(401);
  });

  it('returns 404 when the squad does not exist', async () => {
    mockSquadDocGet.mockResolvedValueOnce({ exists: false });

    const res = await request(buildApp())
      .put(`/burn-squads/${SQUAD_ID}/settings`)
      .set('Authorization', VALID_TOKEN)
      .send({ settings: { onlyAdminsCanAddMembers: true } });

    expect(res.status).toBe(404);
  });

  it('returns 403 when user is not the admin', async () => {
    mockSquadDocGet.mockResolvedValueOnce({
      exists: true,
      data: () => ({ ...SAMPLE_SQUAD, adminUid: OTHER_UID }),
    });

    const res = await request(buildApp())
      .put(`/burn-squads/${SQUAD_ID}/settings`)
      .set('Authorization', VALID_TOKEN)
      .send({ settings: { onlyAdminsCanAddMembers: true } });

    expect(res.status).toBe(403);
  });

  it('returns 400 when settings are missing', async () => {
    mockSquadDocGet.mockResolvedValueOnce({
      exists: true,
      data: () => SAMPLE_SQUAD,
    });

    const res = await request(buildApp())
      .put(`/burn-squads/${SQUAD_ID}/settings`)
      .set('Authorization', VALID_TOKEN)
      .send({});

    expect(res.status).toBe(400);
    expect(res.body).toMatchObject({ error: expect.stringContaining('settings') });
  });

  it('updates squad settings successfully', async () => {
    mockSquadDocGet.mockResolvedValueOnce({
      exists: true,
      data: () => SAMPLE_SQUAD,
    });
    mockSquadDocUpdate.mockResolvedValueOnce(undefined);

    const res = await request(buildApp())
      .put(`/burn-squads/${SQUAD_ID}/settings`)
      .set('Authorization', VALID_TOKEN)
      .send({ settings: { onlyAdminsCanAddMembers: true } });

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ success: true });
    expect(mockSquadDocUpdate).toHaveBeenCalledWith({
      settings: { onlyAdminsCanAddMembers: true },
    });
  });
});

// ── GET /burn-squads/:id/streaks ───────────────────────────────────────────────

describe('GET /burn-squads/:id/streaks', () => {
  it('returns 401 when unauthenticated', async () => {
    const res = await request(buildApp()).get(`/burn-squads/${SQUAD_ID}/streaks`);
    expect(res.status).toBe(401);
  });

  it('returns 404 when the squad does not exist', async () => {
    mockSquadDocGet.mockResolvedValueOnce({ exists: false });

    const res = await request(buildApp())
      .get(`/burn-squads/${SQUAD_ID}/streaks`)
      .set('Authorization', VALID_TOKEN);

    expect(res.status).toBe(404);
  });

  it('returns 403 when user is not a member', async () => {
    mockSquadDocGet.mockResolvedValueOnce({
      exists: true,
      data: () => ({ ...SAMPLE_SQUAD, memberUids: [OTHER_UID] }),
    });

    const res = await request(buildApp())
      .get(`/burn-squads/${SQUAD_ID}/streaks`)
      .set('Authorization', VALID_TOKEN);

    expect(res.status).toBe(403);
  });

  it('returns burnStreak and supernovaStreak when no workouts exist', async () => {
    mockSquadDocGet.mockResolvedValueOnce({
      exists: true,
      data: () => ({ ...SAMPLE_SQUAD, memberUids: [TEST_UID, OTHER_UID] }),
    });
    mockWorkoutsQueryGet
      .mockResolvedValueOnce({ docs: [] })
      .mockResolvedValueOnce({ docs: [] });

    const res = await request(buildApp())
      .get(`/burn-squads/${SQUAD_ID}/streaks`)
      .set('Authorization', VALID_TOKEN);

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ burnStreak: 0, supernovaStreak: 0 });
  });

  it('returns streak counts based on completed workouts', async () => {
    mockSquadDocGet.mockResolvedValueOnce({
      exists: true,
      data: () => ({ ...SAMPLE_SQUAD, memberUids: [TEST_UID, OTHER_UID] }),
    });
    const today = new Date().toISOString().substring(0, 10);
    const workout1 = { id: 'w1', uid: TEST_UID, type: 'Yoga', startedAt: `${today}T08:00:00.000Z`, endedAt: `${today}T09:00:00.000Z`, status: 'completed' };
    const workout2 = { id: 'w2', uid: OTHER_UID, type: 'Yoga', startedAt: `${today}T08:00:00.000Z`, endedAt: `${today}T09:00:00.000Z`, status: 'completed' };
    mockWorkoutsQueryGet
      .mockResolvedValueOnce({ docs: [{ data: () => workout1 }] })
      .mockResolvedValueOnce({ docs: [{ data: () => workout2 }] });

    const res = await request(buildApp())
      .get(`/burn-squads/${SQUAD_ID}/streaks`)
      .set('Authorization', VALID_TOKEN);

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ burnStreak: 1, supernovaStreak: 1 });
  });
});

// ── DELETE /burn-squads/:id ────────────────────────────────────────────────────

describe('DELETE /burn-squads/:id', () => {
  it('returns 401 when unauthenticated', async () => {
    const res = await request(buildApp()).delete(`/burn-squads/${SQUAD_ID}`);
    expect(res.status).toBe(401);
  });

  it('returns 404 when the squad does not exist', async () => {
    mockSquadDocGet.mockResolvedValueOnce({ exists: false });

    const res = await request(buildApp())
      .delete(`/burn-squads/${SQUAD_ID}`)
      .set('Authorization', VALID_TOKEN);

    expect(res.status).toBe(404);
  });

  it('returns 403 when user is not the admin', async () => {
    mockSquadDocGet.mockResolvedValueOnce({
      exists: true,
      data: () => ({ ...SAMPLE_SQUAD, adminUid: OTHER_UID }),
    });

    const res = await request(buildApp())
      .delete(`/burn-squads/${SQUAD_ID}`)
      .set('Authorization', VALID_TOKEN);

    expect(res.status).toBe(403);
  });

  it('deletes the squad and returns 204', async () => {
    mockSquadDocGet.mockResolvedValueOnce({
      exists: true,
      data: () => SAMPLE_SQUAD,
    });
    mockSquadDocDelete.mockResolvedValueOnce(undefined);

    const res = await request(buildApp())
      .delete(`/burn-squads/${SQUAD_ID}`)
      .set('Authorization', VALID_TOKEN);

    expect(res.status).toBe(204);
    expect(mockSquadDocDelete).toHaveBeenCalledOnce();
  });
});
