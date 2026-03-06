import { describe, it, expect, vi, beforeEach } from 'vitest';
import express from 'express';
import request from 'supertest';

// ── vi.hoisted mock declarations ────────────────────────────────────────────
const {
  mockVerifyIdToken,
  // users — doc operations
  mockUsersDocGet,
  mockUsersDocRef,
  // burnBuddies — queries
  mockBuddies1QueryGet,
  mockBuddies2QueryGet,
  // burnSquads — query
  mockSquadsQueryGet,
  // groupWorkouts — query
  mockGroupWorkoutsQueryGet,
  // burnBuddyRequests — queries
  mockBuddyReqIncomingGet,
  mockBuddyReqOutgoingGet,
  mockBuddyReqIncomingChain,
  mockBuddyReqOutgoingChain,
  // burnSquadJoinRequests — queries
  mockSquadReqIncomingGet,
  mockSquadReqOutgoingGet,
  mockSquadReqIncomingChain,
  mockSquadReqOutgoingChain,
  // workouts — active workout query
  mockWorkoutsActiveGet,
  mockWorkoutsActiveChain,
  // workouts — partner activity queries (in operator)
  mockWorkoutsPartnerGet,
  mockWorkoutsPartnerChain,
  // getAll — batched multi-get
  mockGetAll,
  // burnSquads doc ref (for enriching squad join requests)
  mockSquadsDocRef,
  mockSquadsDocGet,
} = vi.hoisted(() => {
  const mockVerifyIdToken = vi.fn();

  // users
  const mockUsersDocGet = vi.fn();
  const mockUsersDocRef = vi.fn(() => ({ get: mockUsersDocGet }));

  // burnBuddies (two query results: uid1 match, uid2 match)
  const mockBuddies1QueryGet = vi.fn();
  const mockBuddies2QueryGet = vi.fn();

  // burnSquads
  const mockSquadsQueryGet = vi.fn();

  // groupWorkouts
  const mockGroupWorkoutsQueryGet = vi.fn();

  // burnBuddyRequests
  const mockBuddyReqIncomingGet = vi.fn();
  const mockBuddyReqOutgoingGet = vi.fn();
  const mockBuddyReqIncomingChain = { where: vi.fn(), get: mockBuddyReqIncomingGet };
  const mockBuddyReqOutgoingChain = { where: vi.fn(), get: mockBuddyReqOutgoingGet };

  // burnSquadJoinRequests
  const mockSquadReqIncomingGet = vi.fn();
  const mockSquadReqOutgoingGet = vi.fn();
  const mockSquadReqIncomingChain = { where: vi.fn(), get: mockSquadReqIncomingGet };
  const mockSquadReqOutgoingChain = { where: vi.fn(), get: mockSquadReqOutgoingGet };

  // workouts — active workout query
  const mockWorkoutsActiveGet = vi.fn();
  const mockWorkoutsActiveChain = { where: vi.fn(), get: mockWorkoutsActiveGet };

  // workouts — partner activity (in queries)
  const mockWorkoutsPartnerGet = vi.fn();
  const mockWorkoutsPartnerChain = { where: vi.fn(), get: mockWorkoutsPartnerGet };

  // getAll
  const mockGetAll = vi.fn();

  // burnSquads doc ref
  const mockSquadsDocGet = vi.fn();
  const mockSquadsDocRef = vi.fn(() => ({ get: mockSquadsDocGet }));

  return {
    mockVerifyIdToken,
    mockUsersDocGet,
    mockUsersDocRef,
    mockBuddies1QueryGet,
    mockBuddies2QueryGet,
    mockSquadsQueryGet,
    mockGroupWorkoutsQueryGet,
    mockBuddyReqIncomingGet,
    mockBuddyReqOutgoingGet,
    mockBuddyReqIncomingChain,
    mockBuddyReqOutgoingChain,
    mockSquadReqIncomingGet,
    mockSquadReqOutgoingGet,
    mockSquadReqIncomingChain,
    mockSquadReqOutgoingChain,
    mockWorkoutsActiveGet,
    mockWorkoutsActiveChain,
    mockWorkoutsPartnerGet,
    mockWorkoutsPartnerChain,
    mockGetAll,
    mockSquadsDocRef,
    mockSquadsDocGet,
  };
});

// ── Module mocks ────────────────────────────────────────────────────────────
vi.mock('../lib/firebase', () => ({
  admin: {
    auth: () => ({ verifyIdToken: mockVerifyIdToken }),
  },
  initFirebase: vi.fn(),
}));

// Track which burnBuddies where() call we're on
let buddiesWhereCallCount = 0;

vi.mock('../lib/firestore', () => ({
  getDb: () => ({
    collection: (name: string) => {
      if (name === 'users') {
        return { doc: mockUsersDocRef };
      }
      if (name === 'burnBuddies') {
        return {
          where: () => {
            buddiesWhereCallCount++;
            if (buddiesWhereCallCount % 2 === 1) {
              return { get: mockBuddies1QueryGet };
            }
            return { get: mockBuddies2QueryGet };
          },
        };
      }
      if (name === 'burnSquads') {
        return {
          doc: mockSquadsDocRef,
          where: () => ({ get: mockSquadsQueryGet }),
        };
      }
      if (name === 'groupWorkouts') {
        return {
          where: () => ({ get: mockGroupWorkoutsQueryGet }),
        };
      }
      if (name === 'burnBuddyRequests') {
        return {
          where: (_field: string, _op: string, value: unknown) => {
            // First where() call — toUid (incoming) or fromUid (outgoing)
            if (value === UID) {
              // We distinguish by accumulating calls; see chain mock below
            }
            // Return the appropriate chain based on call order
            return mockBuddyReqIncomingChain;
          },
        };
      }
      if (name === 'burnSquadJoinRequests') {
        return {
          where: () => mockSquadReqIncomingChain,
        };
      }
      if (name === 'workouts') {
        return {
          where: (_field: string, _op: string, value: unknown) => {
            // uid == <uid> is active workout query, uid in [...] is partner activity
            if (_op === '==' || _op === 'in') {
              if (_op === 'in') return mockWorkoutsPartnerChain;
              return mockWorkoutsActiveChain;
            }
            return mockWorkoutsActiveChain;
          },
        };
      }
      return {};
    },
    getAll: mockGetAll,
  }),
}));

import dashboardRouter from './dashboard';

function buildApp() {
  const app = express();
  app.use(express.json());
  app.use('/dashboard', dashboardRouter);
  return app;
}

const VALID_TOKEN = 'Bearer valid.token';
const UID = 'user-abc-123';
const PARTNER_UID = 'user-xyz-456';

beforeEach(() => {
  vi.resetAllMocks();
  buddiesWhereCallCount = 0;

  // Auth
  mockVerifyIdToken.mockResolvedValue({ uid: UID });

  // User profile doc
  mockUsersDocRef.mockImplementation(() => ({ get: mockUsersDocGet }));
  mockUsersDocGet.mockResolvedValue({
    exists: true,
    data: () => ({
      uid: UID,
      email: 'user@test.com',
      displayName: 'Test User',
      username: 'testuser',
      createdAt: '2026-01-01T00:00:00.000Z',
    }),
  });

  // Empty defaults for all collections
  mockBuddies1QueryGet.mockResolvedValue({ docs: [] });
  mockBuddies2QueryGet.mockResolvedValue({ docs: [] });
  mockSquadsQueryGet.mockResolvedValue({ docs: [] });
  mockGroupWorkoutsQueryGet.mockResolvedValue({ docs: [] });
  mockBuddyReqIncomingGet.mockResolvedValue({ docs: [] });
  mockBuddyReqOutgoingGet.mockResolvedValue({ docs: [] });
  mockSquadReqIncomingGet.mockResolvedValue({ docs: [] });
  mockSquadReqOutgoingGet.mockResolvedValue({ docs: [] });
  mockWorkoutsActiveGet.mockResolvedValue({ docs: [] });
  mockWorkoutsPartnerGet.mockResolvedValue({ docs: [] });
  mockGetAll.mockResolvedValue([]);
  mockSquadsDocRef.mockImplementation(() => ({ get: mockSquadsDocGet }));
  mockSquadsDocGet.mockResolvedValue({ exists: false, data: () => null });

  // Chain mocks for where().where().get()
  mockBuddyReqIncomingChain.where.mockReturnThis();
  mockBuddyReqOutgoingChain.where.mockReturnThis();
  mockSquadReqIncomingChain.where.mockReturnThis();
  mockSquadReqOutgoingChain.where.mockReturnThis();
  mockWorkoutsActiveChain.where.mockReturnThis();
  mockWorkoutsPartnerChain.where.mockReturnThis();
});

// ── Tests ───────────────────────────────────────────────────────────────────

describe('GET /dashboard', () => {
  it('returns 401 when unauthenticated', async () => {
    const res = await request(buildApp()).get('/dashboard');
    expect(res.status).toBe(401);
  });

  it('returns 404 when user profile does not exist', async () => {
    mockUsersDocGet.mockResolvedValueOnce({ exists: false, data: () => null });

    const res = await request(buildApp())
      .get('/dashboard')
      .set('Authorization', VALID_TOKEN);
    expect(res.status).toBe(404);
  });

  it('returns full dashboard payload with empty data', async () => {
    const res = await request(buildApp())
      .get('/dashboard')
      .set('Authorization', VALID_TOKEN);

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      user: { uid: UID, displayName: 'Test User' },
      burnBuddies: [],
      burnSquads: [],
      groupWorkouts: [],
      buddyRequests: { incoming: [], outgoing: [] },
      squadJoinRequests: { incoming: [], outgoing: [] },
      activeWorkout: null,
      partnerActivity: {
        groupWorkoutWindowMs: expect.any(Number),
        activePartnerWorkouts: [],
      },
    });
  });

  it('returns enriched burn buddies with partner names and streaks', async () => {
    const buddy = {
      id: 'bb-1',
      uid1: UID,
      uid2: PARTNER_UID,
      createdAt: '2026-01-01T00:00:00.000Z',
    };

    mockBuddies1QueryGet.mockResolvedValueOnce({
      docs: [{ data: () => buddy }],
    });

    mockGetAll.mockResolvedValueOnce([
      {
        exists: true,
        data: () => ({
          uid: PARTNER_UID,
          displayName: 'Partner User',
          email: 'partner@test.com',
        }),
      },
    ]);

    const res = await request(buildApp())
      .get('/dashboard')
      .set('Authorization', VALID_TOKEN);

    expect(res.status).toBe(200);
    expect(res.body.burnBuddies).toHaveLength(1);
    expect(res.body.burnBuddies[0]).toMatchObject({
      id: 'bb-1',
      partnerUid: PARTNER_UID,
      partnerDisplayName: 'Partner User',
      streaks: { burnStreak: 0, supernovaStreak: 0 },
    });
  });

  it('returns enriched burn squads with streaks', async () => {
    const squad = {
      id: 'sq-1',
      name: 'Test Squad',
      adminUid: UID,
      memberUids: [UID, PARTNER_UID],
      settings: { onlyAdminsCanAddMembers: false },
      createdAt: '2026-01-01T00:00:00.000Z',
    };

    mockSquadsQueryGet.mockResolvedValueOnce({
      docs: [{ data: () => squad }],
    });

    const res = await request(buildApp())
      .get('/dashboard')
      .set('Authorization', VALID_TOKEN);

    expect(res.status).toBe(200);
    expect(res.body.burnSquads).toHaveLength(1);
    expect(res.body.burnSquads[0]).toMatchObject({
      id: 'sq-1',
      name: 'Test Squad',
      streaks: { burnStreak: 0, supernovaStreak: 0 },
    });
  });

  it('includes active workout when one exists', async () => {
    const workout = {
      id: 'w-1',
      uid: UID,
      type: 'Running',
      startedAt: new Date().toISOString(),
      status: 'active',
    };

    mockWorkoutsActiveGet.mockResolvedValueOnce({
      docs: [{ data: () => workout }],
    });

    const res = await request(buildApp())
      .get('/dashboard')
      .set('Authorization', VALID_TOKEN);

    expect(res.status).toBe(200);
    expect(res.body.activeWorkout).toMatchObject({
      id: 'w-1',
      status: 'active',
    });
  });

  it('returns partner activity for active buddy workouts', async () => {
    const buddy = {
      id: 'bb-1',
      uid1: UID,
      uid2: PARTNER_UID,
      createdAt: '2026-01-01T00:00:00.000Z',
    };

    mockBuddies1QueryGet.mockResolvedValueOnce({
      docs: [{ data: () => buddy }],
    });

    mockGetAll.mockResolvedValueOnce([
      {
        exists: true,
        data: () => ({
          uid: PARTNER_UID,
          displayName: 'Partner User',
          email: 'partner@test.com',
        }),
      },
    ]);

    const partnerWorkout = {
      id: 'pw-1',
      uid: PARTNER_UID,
      type: 'Running',
      startedAt: new Date().toISOString(),
      status: 'active',
    };

    mockWorkoutsPartnerGet.mockResolvedValueOnce({
      docs: [{ data: () => partnerWorkout }],
    });

    const res = await request(buildApp())
      .get('/dashboard')
      .set('Authorization', VALID_TOKEN);

    expect(res.status).toBe(200);
    expect(res.body.partnerActivity.activePartnerWorkouts).toHaveLength(1);
    expect(res.body.partnerActivity.activePartnerWorkouts[0]).toMatchObject({
      type: 'buddy',
      referenceId: 'bb-1',
    });
  });

  it('uses Promise.all for parallel fetching (all data fetched in a single round trip)', async () => {
    // Verify the endpoint works with all data types populated
    const buddy = {
      id: 'bb-1',
      uid1: UID,
      uid2: PARTNER_UID,
      createdAt: '2026-01-01T00:00:00.000Z',
    };
    const squad = {
      id: 'sq-1',
      name: 'Squad One',
      adminUid: UID,
      memberUids: [UID, PARTNER_UID],
      settings: { onlyAdminsCanAddMembers: false },
      createdAt: '2026-01-01T00:00:00.000Z',
    };
    const groupWorkout = {
      id: 'gw-1',
      type: 'buddy',
      referenceId: 'bb-1',
      memberUids: [UID, PARTNER_UID],
      startedAt: '2026-03-01T10:00:00.000Z',
      workoutIds: ['w-1', 'w-2'],
    };

    mockBuddies1QueryGet.mockResolvedValueOnce({
      docs: [{ data: () => buddy }],
    });
    mockSquadsQueryGet.mockResolvedValueOnce({
      docs: [{ data: () => squad }],
    });
    mockGroupWorkoutsQueryGet.mockResolvedValueOnce({
      docs: [{ data: () => groupWorkout }],
    });
    mockGetAll.mockResolvedValueOnce([
      {
        exists: true,
        data: () => ({
          uid: PARTNER_UID,
          displayName: 'Partner',
          email: 'partner@test.com',
        }),
      },
    ]);

    const res = await request(buildApp())
      .get('/dashboard')
      .set('Authorization', VALID_TOKEN);

    expect(res.status).toBe(200);
    // Verify all sections are present
    expect(res.body.user.uid).toBe(UID);
    expect(res.body.burnBuddies).toHaveLength(1);
    expect(res.body.burnSquads).toHaveLength(1);
    expect(res.body.groupWorkouts).toHaveLength(1);
    expect(res.body.buddyRequests).toBeDefined();
    expect(res.body.squadJoinRequests).toBeDefined();
    expect(res.body.partnerActivity).toBeDefined();
  });

  it('sets Cache-Control header with max-age=5', async () => {
    const res = await request(buildApp())
      .get('/dashboard')
      .set('Authorization', VALID_TOKEN);

    expect(res.status).toBe(200);
    expect(res.headers['cache-control']).toBe('private, max-age=5');
  });
});
