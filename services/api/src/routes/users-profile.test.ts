import { describe, it, expect, vi, beforeEach } from 'vitest';
import express from 'express';
import request from 'supertest';

// vi.hoisted ensures mock variables are created before the mock factory runs
const {
  mockVerifyIdToken,
  // users — doc operations
  mockUsersDocGet,
  mockUsersDocRef,
  // friends — doc operations
  mockFriendsDocGet,
  mockFriendsDocRef,
  // burnBuddies — query chain
  mockBBQueryGet,
  mockBBQueryChain,
  // burnSquads — query chain
  mockSquadsQueryGet,
  mockSquadsQueryChain,
  // groupWorkouts — query chain
  mockGroupWorkoutsQueryGet,
  mockGroupWorkoutsQueryChain,
  // workouts — query chain
  mockWorkoutsQueryGet,
  mockWorkoutsQueryChain,
  // burnBuddyRequests — query chain
  mockBBRequestQueryGet,
  mockBBRequestQueryChain,
  // db.getAll — batched multi-doc reads
  mockGetAll,
  // usernames — doc operations (needed for other users.ts routes)
  mockUsernamesDocGet,
  mockUsernamesDocRef,
} = vi.hoisted(() => {
  const mockVerifyIdToken = vi.fn();

  // users — doc
  const mockUsersDocGet = vi.fn();
  const mockUsersDocRef = vi.fn(() => ({
    get: mockUsersDocGet,
    set: vi.fn(),
    update: vi.fn(),
  }));

  // friends — doc
  const mockFriendsDocGet = vi.fn();
  const mockFriendsDocRef = vi.fn(() => ({ get: mockFriendsDocGet }));

  // burnBuddies — query chain
  const mockBBQueryGet = vi.fn();
  const mockBBQueryChain = {
    where: vi.fn(),
    get: mockBBQueryGet,
  };

  // burnSquads — query chain
  const mockSquadsQueryGet = vi.fn();
  const mockSquadsQueryChain = {
    where: vi.fn(),
    get: mockSquadsQueryGet,
  };

  // groupWorkouts — query chain
  const mockGroupWorkoutsQueryGet = vi.fn();
  const mockGroupWorkoutsQueryChain = {
    where: vi.fn(),
    get: mockGroupWorkoutsQueryGet,
  };

  // workouts — query chain
  const mockWorkoutsQueryGet = vi.fn();
  const mockWorkoutsQueryChain = {
    where: vi.fn(),
    get: mockWorkoutsQueryGet,
  };

  // burnBuddyRequests — query chain
  const mockBBRequestQueryGet = vi.fn();
  const mockBBRequestQueryChain = {
    where: vi.fn(),
    limit: vi.fn(),
    get: mockBBRequestQueryGet,
  };

  // db.getAll — batched multi-doc reads
  const mockGetAll = vi.fn();

  // usernames — doc (needed for PUT /users/me which is part of the same router)
  const mockUsernamesDocGet = vi.fn();
  const mockUsernamesDocRef = vi.fn(() => ({
    get: mockUsernamesDocGet,
    set: vi.fn(),
    delete: vi.fn(),
  }));

  return {
    mockVerifyIdToken,
    mockUsersDocGet,
    mockUsersDocRef,
    mockFriendsDocGet,
    mockFriendsDocRef,
    mockBBQueryGet,
    mockBBQueryChain,
    mockSquadsQueryGet,
    mockSquadsQueryChain,
    mockGroupWorkoutsQueryGet,
    mockGroupWorkoutsQueryChain,
    mockWorkoutsQueryGet,
    mockWorkoutsQueryChain,
    mockBBRequestQueryGet,
    mockBBRequestQueryChain,
    mockGetAll,
    mockUsernamesDocGet,
    mockUsernamesDocRef,
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
      if (name === 'users') {
        return {
          doc: mockUsersDocRef,
          where: () => mockWorkoutsQueryChain, // prefix search (email/username)
        };
      }
      if (name === 'friends') {
        return { doc: mockFriendsDocRef };
      }
      if (name === 'burnBuddies') {
        return { where: () => mockBBQueryChain };
      }
      if (name === 'burnSquads') {
        return { where: () => mockSquadsQueryChain };
      }
      if (name === 'groupWorkouts') {
        return { where: () => mockGroupWorkoutsQueryChain };
      }
      if (name === 'workouts') {
        return { where: () => mockWorkoutsQueryChain };
      }
      if (name === 'burnBuddyRequests') {
        return { where: () => mockBBRequestQueryChain };
      }
      if (name === 'usernames') {
        return { doc: mockUsernamesDocRef };
      }
      return {};
    },
    getAll: mockGetAll,
    batch: () => ({
      set: vi.fn(),
      delete: vi.fn(),
      commit: vi.fn(),
    }),
  }),
}));

import usersRouter from './users';

function buildApp() {
  const app = express();
  app.use(express.json());
  app.use('/users', usersRouter);
  return app;
}

const VALID_TOKEN = 'Bearer valid.token';
const REQUESTER_UID = 'requester-uid-001';
const TARGET_UID = 'target-uid-002';
const PARTNER_UID = 'partner-uid-003';

beforeEach(() => {
  vi.resetAllMocks();

  // Re-setup auth mock
  mockVerifyIdToken.mockResolvedValue({ uid: REQUESTER_UID });

  // Re-setup query chains (mockReturnThis must be re-applied after resetAllMocks)
  mockBBQueryChain.where.mockReturnThis();
  mockSquadsQueryChain.where.mockReturnThis();
  mockGroupWorkoutsQueryChain.where.mockReturnThis();
  mockWorkoutsQueryChain.where.mockReturnThis();
  mockBBRequestQueryChain.where.mockReturnThis();
  mockBBRequestQueryChain.limit.mockReturnThis();

  // Re-setup doc refs
  mockUsersDocRef.mockImplementation(() => ({
    get: mockUsersDocGet,
    set: vi.fn(),
    update: vi.fn(),
  }));
  mockFriendsDocRef.mockImplementation(() => ({ get: mockFriendsDocGet }));
  mockUsernamesDocRef.mockImplementation(() => ({
    get: mockUsernamesDocGet,
    set: vi.fn(),
    delete: vi.fn(),
  }));
});

// ── GET /users/:uid/profile ──────────────────────────────────────────────────

describe('GET /users/:uid/profile', () => {
  it('returns 401 when unauthenticated', async () => {
    const res = await request(buildApp()).get(`/users/${TARGET_UID}/profile`);
    expect(res.status).toBe(401);
  });

  it('returns 404 when the target user does not exist', async () => {
    mockUsersDocGet.mockResolvedValueOnce({ exists: false });

    const res = await request(buildApp())
      .get(`/users/${TARGET_UID}/profile`)
      .set('Authorization', VALID_TOKEN);

    expect(res.status).toBe(404);
  });

  it('returns 403 when the requester is not a friend of the target', async () => {
    mockUsersDocGet.mockResolvedValueOnce({
      exists: true,
      data: () => ({ uid: TARGET_UID, displayName: 'Target User', username: 'targetuser' }),
    });
    mockFriendsDocGet.mockResolvedValueOnce({ exists: false });

    const res = await request(buildApp())
      .get(`/users/${TARGET_UID}/profile`)
      .set('Authorization', VALID_TOKEN);

    expect(res.status).toBe(403);
  });

  it('returns profile stats with no relationships or workouts', async () => {
    // Target user exists
    mockUsersDocGet.mockResolvedValueOnce({
      exists: true,
      data: () => ({ uid: TARGET_UID, displayName: 'Target User', username: 'targetuser' }),
    });
    // They are friends
    mockFriendsDocGet.mockResolvedValueOnce({ exists: true });
    // No burn buddies
    mockBBQueryGet.mockResolvedValueOnce({ docs: [] }); // uid1 query
    mockBBQueryGet.mockResolvedValueOnce({ docs: [] }); // uid2 query
    // No squads
    mockSquadsQueryGet.mockResolvedValueOnce({ docs: [] });
    // No individual workouts
    mockWorkoutsQueryGet.mockResolvedValueOnce({ docs: [] });
    // No buddy requests (not buddies, so requests are checked)
    mockBBRequestQueryGet.mockResolvedValueOnce({ empty: true, docs: [] }); // sent
    mockBBRequestQueryGet.mockResolvedValueOnce({ empty: true, docs: [] }); // received

    const res = await request(buildApp())
      .get(`/users/${TARGET_UID}/profile`)
      .set('Authorization', VALID_TOKEN);

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      displayName: 'Target User',
      username: 'targetuser',
      highestActiveStreak: null,
      highestStreakEver: null,
      firstWorkoutDate: null,
      workoutsAllTime: 0,
      workoutsThisMonth: 0,
      buddyRelationshipStatus: 'none',
      friendshipStatus: 'friends',
      pendingBuddyRequestId: null,
      burnBuddyId: null,
    });
  });

  it('returns correct stats with buddy relationship and workouts', async () => {
    const now = new Date();
    const thisMonth = `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, '0')}`;
    const today = now.toISOString().substring(0, 10);

    const bbId = 'bb-001';
    const burnBuddy = {
      id: bbId,
      uid1: REQUESTER_UID,
      uid2: TARGET_UID,
      createdAt: '2025-01-01T00:00:00.000Z',
    };

    // Target user profile
    mockUsersDocGet.mockResolvedValueOnce({
      exists: true,
      data: () => ({ uid: TARGET_UID, displayName: 'Target User', username: 'targetuser' }),
    });
    // Friendship check
    mockFriendsDocGet.mockResolvedValueOnce({ exists: true });
    // Burn buddies: uid1 query returns the buddy (REQUESTER < TARGET alphabetically)
    mockBBQueryGet.mockResolvedValueOnce({ docs: [{ data: () => burnBuddy }] }); // uid1 query
    mockBBQueryGet.mockResolvedValueOnce({ docs: [] }); // uid2 query
    // No squads
    mockSquadsQueryGet.mockResolvedValueOnce({ docs: [] });
    // Partner profile batch lookup via getAll
    mockGetAll.mockResolvedValueOnce([
      {
        exists: true,
        data: () => ({ uid: REQUESTER_UID, displayName: 'Requester User' }),
      },
    ]);
    // Group workouts for this buddy (single batched 'in' query)
    mockGroupWorkoutsQueryGet.mockResolvedValueOnce({
      docs: [
        {
          data: () => ({
            id: 'gw-1',
            type: 'buddy',
            referenceId: bbId,
            memberUids: [REQUESTER_UID, TARGET_UID],
            startedAt: `${today}T10:00:00.000Z`,
            workoutIds: ['w1', 'w2'],
          }),
        },
        {
          data: () => ({
            id: 'gw-2',
            type: 'buddy',
            referenceId: bbId,
            memberUids: [REQUESTER_UID, TARGET_UID],
            startedAt: `${thisMonth}-01T10:00:00.000Z`,
            workoutIds: ['w3', 'w4'],
          }),
        },
      ],
    });
    // Individual workouts
    mockWorkoutsQueryGet.mockResolvedValueOnce({
      docs: [
        {
          data: () => ({
            id: 'w1',
            uid: TARGET_UID,
            type: 'Running',
            startedAt: `${thisMonth}-01T09:00:00.000Z`,
            status: 'completed',
          }),
        },
        {
          data: () => ({
            id: 'w3',
            uid: TARGET_UID,
            type: 'Cycling',
            startedAt: `${today}T09:30:00.000Z`,
            status: 'completed',
          }),
        },
        {
          data: () => ({
            id: 'w-old',
            uid: TARGET_UID,
            type: 'Yoga',
            startedAt: '2024-06-15T08:00:00.000Z',
            status: 'completed',
          }),
        },
      ],
    });
    // buddyRelationshipStatus: requester IS the buddy partner, so isBuddy should be true
    // No burnBuddyRequests check needed since they are already buddies

    const res = await request(buildApp())
      .get(`/users/${TARGET_UID}/profile`)
      .set('Authorization', VALID_TOKEN);

    expect(res.status).toBe(200);
    expect(res.body.displayName).toBe('Target User');
    expect(res.body.buddyRelationshipStatus).toBe('buddies');
    const [sortedUid1, sortedUid2] = [REQUESTER_UID, TARGET_UID].sort();
    expect(res.body.burnBuddyId).toBe(`${sortedUid1}_${sortedUid2}`);
    expect(res.body.pendingBuddyRequestId).toBeNull();
    expect(res.body.friendshipStatus).toBe('friends');
    expect(res.body.highestActiveStreak).not.toBeNull();
    expect(res.body.highestActiveStreak.name).toBe('Requester User');
    expect(res.body.highestStreakEver).not.toBeNull();
    expect(res.body.highestStreakEver.value).toBeGreaterThanOrEqual(2);
    expect(res.body.firstWorkoutDate).toBe('2024-06-15T08:00:00.000Z');
    expect(res.body.workoutsAllTime).toBe(3);
    // 2 workouts this month (w1 and w3)
    expect(res.body.workoutsThisMonth).toBeGreaterThanOrEqual(2);
  });

  it('returns buddyRelationshipStatus as pending_sent with request ID', async () => {
    // Target user profile
    mockUsersDocGet.mockResolvedValueOnce({
      exists: true,
      data: () => ({ uid: TARGET_UID, displayName: 'Target User', username: 'targetuser' }),
    });
    // Friendship check
    mockFriendsDocGet.mockResolvedValueOnce({ exists: true });
    // No burn buddies
    mockBBQueryGet.mockResolvedValueOnce({ docs: [] });
    mockBBQueryGet.mockResolvedValueOnce({ docs: [] });
    // No squads
    mockSquadsQueryGet.mockResolvedValueOnce({ docs: [] });
    // No individual workouts
    mockWorkoutsQueryGet.mockResolvedValueOnce({ docs: [] });
    // Pending sent request
    mockBBRequestQueryGet.mockResolvedValueOnce({
      empty: false,
      docs: [{ id: 'req-sent-001', data: () => ({}) }],
    });

    const res = await request(buildApp())
      .get(`/users/${TARGET_UID}/profile`)
      .set('Authorization', VALID_TOKEN);

    expect(res.status).toBe(200);
    expect(res.body.buddyRelationshipStatus).toBe('pending_sent');
    expect(res.body.pendingBuddyRequestId).toBe('req-sent-001');
    expect(res.body.burnBuddyId).toBeNull();
  });

  it('returns buddyRelationshipStatus as pending_received with request ID', async () => {
    // Target user profile
    mockUsersDocGet.mockResolvedValueOnce({
      exists: true,
      data: () => ({ uid: TARGET_UID, displayName: 'Target User', username: 'targetuser' }),
    });
    // Friendship check
    mockFriendsDocGet.mockResolvedValueOnce({ exists: true });
    // No burn buddies
    mockBBQueryGet.mockResolvedValueOnce({ docs: [] });
    mockBBQueryGet.mockResolvedValueOnce({ docs: [] });
    // No squads
    mockSquadsQueryGet.mockResolvedValueOnce({ docs: [] });
    // No individual workouts
    mockWorkoutsQueryGet.mockResolvedValueOnce({ docs: [] });
    // No sent request, but has received request
    mockBBRequestQueryGet.mockResolvedValueOnce({ empty: true, docs: [] }); // sent
    mockBBRequestQueryGet.mockResolvedValueOnce({
      empty: false,
      docs: [{ id: 'req-recv-002', data: () => ({}) }],
    }); // received

    const res = await request(buildApp())
      .get(`/users/${TARGET_UID}/profile`)
      .set('Authorization', VALID_TOKEN);

    expect(res.status).toBe(200);
    expect(res.body.buddyRelationshipStatus).toBe('pending_received');
    expect(res.body.pendingBuddyRequestId).toBe('req-recv-002');
    expect(res.body.burnBuddyId).toBeNull();
  });

  it('aggregates stats across multiple buddy and squad relationships', async () => {
    const now = new Date();
    const today = now.toISOString().substring(0, 10);

    const bb1 = {
      id: 'bb-001',
      uid1: PARTNER_UID,
      uid2: TARGET_UID,
      createdAt: '2025-01-01T00:00:00.000Z',
    };
    const squad1 = {
      id: 'squad-001',
      name: 'Morning Crew',
      adminUid: TARGET_UID,
      memberUids: [TARGET_UID, PARTNER_UID],
      settings: { onlyAdminsCanAddMembers: false },
      createdAt: '2025-01-01T00:00:00.000Z',
    };

    // Target user profile
    mockUsersDocGet.mockResolvedValueOnce({
      exists: true,
      data: () => ({ uid: TARGET_UID, displayName: 'Target User', username: 'targetuser' }),
    });
    // Friendship check
    mockFriendsDocGet.mockResolvedValueOnce({ exists: true });
    // Burn buddies: uid1 returns empty, uid2 returns one buddy
    mockBBQueryGet.mockResolvedValueOnce({ docs: [] }); // uid1 query
    mockBBQueryGet.mockResolvedValueOnce({ docs: [{ data: () => bb1 }] }); // uid2 query
    // Squads
    mockSquadsQueryGet.mockResolvedValueOnce({ docs: [{ data: () => squad1 }] });
    // Partner profile batch lookup via getAll
    mockGetAll.mockResolvedValueOnce([
      {
        exists: true,
        data: () => ({ uid: PARTNER_UID, displayName: 'Partner User' }),
      },
    ]);
    // Group workouts for buddy AND squad (single batched 'in' query returns all)
    const yesterday = new Date(now.getTime() - 86400000).toISOString().substring(0, 10);
    const dayBefore = new Date(now.getTime() - 2 * 86400000).toISOString().substring(0, 10);
    mockGroupWorkoutsQueryGet.mockResolvedValueOnce({
      docs: [
        {
          data: () => ({
            id: 'gw-bb-1',
            type: 'buddy',
            referenceId: 'bb-001',
            memberUids: [TARGET_UID, PARTNER_UID],
            startedAt: `${today}T10:00:00.000Z`,
            workoutIds: ['w1', 'w2'],
          }),
        },
        {
          data: () => ({
            id: 'gw-sq-1',
            type: 'squad',
            referenceId: 'squad-001',
            memberUids: [TARGET_UID, PARTNER_UID],
            startedAt: `${dayBefore}T08:00:00.000Z`,
            workoutIds: ['w5', 'w6'],
          }),
        },
        {
          data: () => ({
            id: 'gw-sq-2',
            type: 'squad',
            referenceId: 'squad-001',
            memberUids: [TARGET_UID, PARTNER_UID],
            startedAt: `${yesterday}T08:00:00.000Z`,
            workoutIds: ['w7', 'w8'],
          }),
        },
        {
          data: () => ({
            id: 'gw-sq-3',
            type: 'squad',
            referenceId: 'squad-001',
            memberUids: [TARGET_UID, PARTNER_UID],
            startedAt: `${today}T08:00:00.000Z`,
            workoutIds: ['w9', 'w10'],
          }),
        },
      ],
    });
    // No individual workouts
    mockWorkoutsQueryGet.mockResolvedValueOnce({ docs: [] });
    // Not buddies with requester, no pending requests
    mockBBRequestQueryGet.mockResolvedValueOnce({ empty: true, docs: [] });
    mockBBRequestQueryGet.mockResolvedValueOnce({ empty: true, docs: [] });

    const res = await request(buildApp())
      .get(`/users/${TARGET_UID}/profile`)
      .set('Authorization', VALID_TOKEN);

    expect(res.status).toBe(200);
    // Squad has higher active streak (3) vs buddy (1)
    expect(res.body.highestActiveStreak).toEqual({ value: 3, name: 'Morning Crew' });
    // Squad also has highest streak ever (3)
    expect(res.body.highestStreakEver.value).toBe(3);
    expect(res.body.highestStreakEver.name).toBe('Morning Crew');
    expect(res.body.buddyRelationshipStatus).toBe('none');
    expect(res.body.pendingBuddyRequestId).toBeNull();
    expect(res.body.burnBuddyId).toBeNull();
  });

  it('uses batched getAll for partner lookups and in-query for group workouts', async () => {
    const now = new Date();
    const today = now.toISOString().substring(0, 10);

    const bb1 = { id: 'bb-001', uid1: REQUESTER_UID, uid2: TARGET_UID, createdAt: '2025-01-01T00:00:00.000Z' };
    const bb2 = { id: 'bb-002', uid1: TARGET_UID, uid2: PARTNER_UID, createdAt: '2025-02-01T00:00:00.000Z' };

    // Target user profile
    mockUsersDocGet.mockResolvedValueOnce({
      exists: true,
      data: () => ({ uid: TARGET_UID, displayName: 'Target User', username: 'targetuser' }),
    });
    // Friendship check
    mockFriendsDocGet.mockResolvedValueOnce({ exists: true });
    // Burn buddies: uid1 returns bb1, uid2 returns bb2
    mockBBQueryGet.mockResolvedValueOnce({ docs: [{ data: () => bb1 }] });
    mockBBQueryGet.mockResolvedValueOnce({ docs: [{ data: () => bb2 }] });
    // No squads
    mockSquadsQueryGet.mockResolvedValueOnce({ docs: [] });
    // Partner batch lookup via getAll: returns both partners
    mockGetAll.mockResolvedValueOnce([
      { exists: true, data: () => ({ uid: REQUESTER_UID, displayName: 'Requester User' }) },
      { exists: true, data: () => ({ uid: PARTNER_UID, displayName: 'Partner User' }) },
    ]);
    // Group workouts for both buddies in a single batched 'in' query
    mockGroupWorkoutsQueryGet.mockResolvedValueOnce({
      docs: [
        {
          data: () => ({
            id: 'gw-1', type: 'buddy', referenceId: 'bb-001',
            memberUids: [REQUESTER_UID, TARGET_UID],
            startedAt: `${today}T10:00:00.000Z`, workoutIds: ['w1', 'w2'],
          }),
        },
        {
          data: () => ({
            id: 'gw-2', type: 'buddy', referenceId: 'bb-002',
            memberUids: [TARGET_UID, PARTNER_UID],
            startedAt: `${today}T11:00:00.000Z`, workoutIds: ['w3', 'w4'],
          }),
        },
      ],
    });
    // Individual workouts
    mockWorkoutsQueryGet.mockResolvedValueOnce({ docs: [] });

    const res = await request(buildApp())
      .get(`/users/${TARGET_UID}/profile`)
      .set('Authorization', VALID_TOKEN);

    expect(res.status).toBe(200);
    expect(res.body.buddyRelationshipStatus).toBe('buddies');
    const [sortedUid1, sortedUid2] = [REQUESTER_UID, TARGET_UID].sort();
    expect(res.body.burnBuddyId).toBe(`${sortedUid1}_${sortedUid2}`);
    expect(res.body.pendingBuddyRequestId).toBeNull();
    // Verify getAll was called once with 2 doc refs (batched, not per-partner)
    expect(mockGetAll).toHaveBeenCalledTimes(1);
    expect(mockGetAll.mock.calls[0]).toHaveLength(2);
    // Verify group workouts query used a single 'in' query (not per-referenceId)
    expect(mockGroupWorkoutsQueryGet).toHaveBeenCalledTimes(1);
  });
});
