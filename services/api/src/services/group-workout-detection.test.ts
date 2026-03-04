import { describe, it, expect, vi, beforeEach } from 'vitest';

// vi.hoisted ensures mock variables are created before the mock factory runs
const {
  // burnBuddies query
  mockBuddiesQueryGet,
  mockBuddiesQueryChain,
  // burnSquads query
  mockSquadsQueryGet,
  mockSquadsQueryChain,
  // workouts query (reused across multiple sequential calls)
  mockWorkoutsQueryGet,
  mockWorkoutsQueryChain,
  // groupWorkouts — query (dedup check) + doc (set)
  mockGroupWorkoutsQueryGet,
  mockGroupWorkoutsQueryChain,
  mockGroupWorkoutsDocSet,
  mockGroupWorkoutsDocRef,
} = vi.hoisted(() => {
  // burnBuddies
  const mockBuddiesQueryGet = vi.fn();
  const mockBuddiesQueryChain = { where: vi.fn(), get: mockBuddiesQueryGet };

  // burnSquads
  const mockSquadsQueryGet = vi.fn();
  const mockSquadsQueryChain = { where: vi.fn(), get: mockSquadsQueryGet };

  // workouts (3 chained wheres: uid, status, startedAt)
  const mockWorkoutsQueryGet = vi.fn();
  const mockWorkoutsQueryChain = { where: vi.fn(), get: mockWorkoutsQueryGet };

  // groupWorkouts — query + doc
  const mockGroupWorkoutsQueryGet = vi.fn();
  const mockGroupWorkoutsQueryChain = { where: vi.fn(), get: mockGroupWorkoutsQueryGet };
  const mockGroupWorkoutsDocSet = vi.fn();
  const mockGroupWorkoutsDocRef = vi.fn(() => ({ set: mockGroupWorkoutsDocSet }));

  return {
    mockBuddiesQueryGet,
    mockBuddiesQueryChain,
    mockSquadsQueryGet,
    mockSquadsQueryChain,
    mockWorkoutsQueryGet,
    mockWorkoutsQueryChain,
    mockGroupWorkoutsQueryGet,
    mockGroupWorkoutsQueryChain,
    mockGroupWorkoutsDocSet,
    mockGroupWorkoutsDocRef,
  };
});

vi.mock('../lib/firestore', () => ({
  getDb: () => ({
    collection: (name: string) => {
      if (name === 'burnBuddies') {
        // collection().where() returns the query chain; no further chaining needed
        return { where: () => mockBuddiesQueryChain };
      }
      if (name === 'burnSquads') {
        return { where: () => mockSquadsQueryChain };
      }
      if (name === 'workouts') {
        // collection().where() returns the chain; subsequent .where() calls mockReturnThis
        return { where: () => mockWorkoutsQueryChain };
      }
      if (name === 'groupWorkouts') {
        return {
          where: () => mockGroupWorkoutsQueryChain,
          doc: mockGroupWorkoutsDocRef,
        };
      }
      return {};
    },
  }),
}));

import { detectGroupWorkouts } from './group-workout-detection';
import type { Workout } from '@burnbuddy/shared';

const UID = 'user-a';
const PARTNER_UID = 'user-b';
const BUDDY_ID = 'buddy-001';
const SQUAD_ID = 'squad-001';

const NOW_WORKOUT: Workout = {
  id: 'workout-now',
  uid: UID,
  type: 'Running',
  startedAt: new Date().toISOString(),
  status: 'active',
};

const PARTNER_WORKOUT: Workout = {
  id: 'workout-partner',
  uid: PARTNER_UID,
  type: 'Cycling',
  startedAt: new Date().toISOString(),
  status: 'active',
};

function emptySnap() {
  return { empty: true, docs: [] };
}

function snapOf(...items: object[]) {
  return {
    empty: items.length === 0,
    docs: items.map((data) => ({ data: () => data })),
  };
}

beforeEach(() => {
  vi.resetAllMocks();

  // Re-apply mockReturnThis for chained query chains after resetAllMocks
  mockBuddiesQueryChain.where.mockReturnThis();
  mockSquadsQueryChain.where.mockReturnThis();
  mockWorkoutsQueryChain.where.mockReturnThis();
  mockGroupWorkoutsQueryChain.where.mockReturnThis();

  // Default doc ref
  mockGroupWorkoutsDocRef.mockImplementation(() => ({ set: mockGroupWorkoutsDocSet }));
});

// ── No relationships ───────────────────────────────────────────────────────────

describe('no burn buddies and no burn squads', () => {
  it('returns an empty array', async () => {
    mockBuddiesQueryGet.mockResolvedValueOnce(emptySnap()); // uid1 query
    mockBuddiesQueryGet.mockResolvedValueOnce(emptySnap()); // uid2 query
    mockSquadsQueryGet.mockResolvedValueOnce(emptySnap());

    const result = await detectGroupWorkouts(UID, NOW_WORKOUT);

    expect(result).toEqual([]);
    expect(mockGroupWorkoutsDocSet).not.toHaveBeenCalled();
  });
});

// ── Burn Buddy detection ───────────────────────────────────────────────────────

describe('burn buddy detection', () => {
  it('does not create a group workout when partner has no active workout', async () => {
    const buddy = { id: BUDDY_ID, uid1: UID, uid2: PARTNER_UID, createdAt: '' };

    mockBuddiesQueryGet.mockResolvedValueOnce(snapOf(buddy)); // uid1 match
    mockBuddiesQueryGet.mockResolvedValueOnce(emptySnap()); // uid2 match
    mockWorkoutsQueryGet.mockResolvedValueOnce(emptySnap()); // partner has no active workout
    mockSquadsQueryGet.mockResolvedValueOnce(emptySnap());

    const result = await detectGroupWorkouts(UID, NOW_WORKOUT);

    expect(result).toEqual([]);
    expect(mockGroupWorkoutsDocSet).not.toHaveBeenCalled();
  });

  it('creates a group workout when partner has an active workout within 20 min', async () => {
    const buddy = { id: BUDDY_ID, uid1: UID, uid2: PARTNER_UID, createdAt: '' };

    mockBuddiesQueryGet.mockResolvedValueOnce(snapOf(buddy)); // uid1 match
    mockBuddiesQueryGet.mockResolvedValueOnce(emptySnap()); // uid2 match
    mockWorkoutsQueryGet.mockResolvedValueOnce(snapOf(PARTNER_WORKOUT)); // partner active workout
    mockGroupWorkoutsQueryGet.mockResolvedValueOnce(emptySnap()); // no existing GroupWorkout
    mockGroupWorkoutsDocSet.mockResolvedValueOnce(undefined);
    mockSquadsQueryGet.mockResolvedValueOnce(emptySnap());

    const result = await detectGroupWorkouts(UID, NOW_WORKOUT);

    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({
      type: 'buddy',
      referenceId: BUDDY_ID,
      workoutIds: expect.arrayContaining([NOW_WORKOUT.id, PARTNER_WORKOUT.id]),
    });
    expect(result[0].memberUids).toEqual([UID, PARTNER_UID].sort());
    expect(mockGroupWorkoutsDocSet).toHaveBeenCalledOnce();
  });

  it('uses partner uid from uid2 when current user is uid1', async () => {
    // buddy where uid1 == UID, uid2 == PARTNER_UID
    const buddy = { id: BUDDY_ID, uid1: UID, uid2: PARTNER_UID, createdAt: '' };

    mockBuddiesQueryGet.mockResolvedValueOnce(snapOf(buddy));
    mockBuddiesQueryGet.mockResolvedValueOnce(emptySnap());
    mockWorkoutsQueryGet.mockResolvedValueOnce(snapOf(PARTNER_WORKOUT));
    mockGroupWorkoutsQueryGet.mockResolvedValueOnce(emptySnap());
    mockGroupWorkoutsDocSet.mockResolvedValueOnce(undefined);
    mockSquadsQueryGet.mockResolvedValueOnce(emptySnap());

    const result = await detectGroupWorkouts(UID, NOW_WORKOUT);
    expect(result[0].memberUids).toContain(PARTNER_UID);
  });

  it('uses partner uid from uid1 when current user is uid2', async () => {
    const OTHER_UID = 'user-c';
    // buddy where uid2 == UID, uid1 == OTHER_UID
    const buddy = { id: BUDDY_ID, uid1: OTHER_UID, uid2: UID, createdAt: '' };
    const otherWorkout: Workout = { id: 'workout-other', uid: OTHER_UID, type: 'Running', startedAt: new Date().toISOString(), status: 'active' };

    mockBuddiesQueryGet.mockResolvedValueOnce(emptySnap()); // uid1 match — none
    mockBuddiesQueryGet.mockResolvedValueOnce(snapOf(buddy)); // uid2 match
    mockWorkoutsQueryGet.mockResolvedValueOnce(snapOf(otherWorkout));
    mockGroupWorkoutsQueryGet.mockResolvedValueOnce(emptySnap());
    mockGroupWorkoutsDocSet.mockResolvedValueOnce(undefined);
    mockSquadsQueryGet.mockResolvedValueOnce(emptySnap());

    const result = await detectGroupWorkouts(UID, NOW_WORKOUT);
    expect(result[0].memberUids).toContain(OTHER_UID);
  });

  it('skips creating a group workout when one already exists for the buddy pair (dedup)', async () => {
    const buddy = { id: BUDDY_ID, uid1: UID, uid2: PARTNER_UID, createdAt: '' };
    const existingGroupWorkout = { id: 'gw-existing', type: 'buddy', referenceId: BUDDY_ID, startedAt: new Date().toISOString() };

    mockBuddiesQueryGet.mockResolvedValueOnce(snapOf(buddy));
    mockBuddiesQueryGet.mockResolvedValueOnce(emptySnap());
    mockWorkoutsQueryGet.mockResolvedValueOnce(snapOf(PARTNER_WORKOUT));
    mockGroupWorkoutsQueryGet.mockResolvedValueOnce(snapOf(existingGroupWorkout)); // already exists
    mockSquadsQueryGet.mockResolvedValueOnce(emptySnap());

    const result = await detectGroupWorkouts(UID, NOW_WORKOUT);

    expect(result).toEqual([]);
    expect(mockGroupWorkoutsDocSet).not.toHaveBeenCalled();
  });

  it('handles multiple burn buddies — creates group workout only for active partners', async () => {
    const buddy1 = { id: BUDDY_ID, uid1: UID, uid2: PARTNER_UID, createdAt: '' };
    const buddy2 = { id: 'buddy-002', uid1: UID, uid2: 'user-c', createdAt: '' };

    const partnerCWorkout: Workout = { id: 'workout-c', uid: 'user-c', type: 'Yoga', startedAt: new Date().toISOString(), status: 'active' };

    mockBuddiesQueryGet.mockResolvedValueOnce(snapOf(buddy1, buddy2)); // uid1 match
    mockBuddiesQueryGet.mockResolvedValueOnce(emptySnap()); // uid2 match

    // buddy1 partner: not active
    mockWorkoutsQueryGet.mockResolvedValueOnce(emptySnap());
    // buddy2 partner: active
    mockWorkoutsQueryGet.mockResolvedValueOnce(snapOf(partnerCWorkout));
    mockGroupWorkoutsQueryGet.mockResolvedValueOnce(emptySnap()); // no existing for buddy2
    mockGroupWorkoutsDocSet.mockResolvedValueOnce(undefined);

    mockSquadsQueryGet.mockResolvedValueOnce(emptySnap());

    const result = await detectGroupWorkouts(UID, NOW_WORKOUT);

    expect(result).toHaveLength(1);
    expect(result[0].referenceId).toBe('buddy-002');
  });
});

// ── Burn Squad detection ───────────────────────────────────────────────────────

describe('burn squad detection', () => {
  it('does not create a group workout when a squad member is not active', async () => {
    const squad = {
      id: SQUAD_ID,
      name: 'Fire Crew',
      adminUid: UID,
      memberUids: [UID, PARTNER_UID],
      settings: { onlyAdminsCanAddMembers: false },
      createdAt: '',
    };

    mockBuddiesQueryGet.mockResolvedValueOnce(emptySnap());
    mockBuddiesQueryGet.mockResolvedValueOnce(emptySnap());
    mockSquadsQueryGet.mockResolvedValueOnce(snapOf(squad));
    mockWorkoutsQueryGet.mockResolvedValueOnce(emptySnap()); // partner not active

    const result = await detectGroupWorkouts(UID, NOW_WORKOUT);

    expect(result).toEqual([]);
    expect(mockGroupWorkoutsDocSet).not.toHaveBeenCalled();
  });

  it('creates a group workout when ALL squad members are active within 20 min', async () => {
    const squad = {
      id: SQUAD_ID,
      name: 'Fire Crew',
      adminUid: UID,
      memberUids: [UID, PARTNER_UID],
      settings: { onlyAdminsCanAddMembers: false },
      createdAt: '',
    };

    mockBuddiesQueryGet.mockResolvedValueOnce(emptySnap());
    mockBuddiesQueryGet.mockResolvedValueOnce(emptySnap());
    mockSquadsQueryGet.mockResolvedValueOnce(snapOf(squad));
    mockWorkoutsQueryGet.mockResolvedValueOnce(snapOf(PARTNER_WORKOUT)); // partner active
    mockGroupWorkoutsQueryGet.mockResolvedValueOnce(emptySnap()); // no existing
    mockGroupWorkoutsDocSet.mockResolvedValueOnce(undefined);

    const result = await detectGroupWorkouts(UID, NOW_WORKOUT);

    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({
      type: 'squad',
      referenceId: SQUAD_ID,
      memberUids: [UID, PARTNER_UID],
    });
    expect(result[0].workoutIds).toContain(NOW_WORKOUT.id);
    expect(result[0].workoutIds).toContain(PARTNER_WORKOUT.id);
    expect(mockGroupWorkoutsDocSet).toHaveBeenCalledOnce();
  });

  it('skips creating a group workout when one already exists for the squad (dedup)', async () => {
    const squad = {
      id: SQUAD_ID,
      name: 'Fire Crew',
      adminUid: UID,
      memberUids: [UID, PARTNER_UID],
      settings: { onlyAdminsCanAddMembers: false },
      createdAt: '',
    };
    const existingGroupWorkout = { id: 'gw-existing', type: 'squad', referenceId: SQUAD_ID, startedAt: new Date().toISOString() };

    mockBuddiesQueryGet.mockResolvedValueOnce(emptySnap());
    mockBuddiesQueryGet.mockResolvedValueOnce(emptySnap());
    mockSquadsQueryGet.mockResolvedValueOnce(snapOf(squad));
    mockWorkoutsQueryGet.mockResolvedValueOnce(snapOf(PARTNER_WORKOUT));
    mockGroupWorkoutsQueryGet.mockResolvedValueOnce(snapOf(existingGroupWorkout)); // already exists

    const result = await detectGroupWorkouts(UID, NOW_WORKOUT);

    expect(result).toEqual([]);
    expect(mockGroupWorkoutsDocSet).not.toHaveBeenCalled();
  });

  it('skips squads where the current user is the only member', async () => {
    const squad = {
      id: SQUAD_ID,
      name: 'Solo Squad',
      adminUid: UID,
      memberUids: [UID],
      settings: { onlyAdminsCanAddMembers: false },
      createdAt: '',
    };

    mockBuddiesQueryGet.mockResolvedValueOnce(emptySnap());
    mockBuddiesQueryGet.mockResolvedValueOnce(emptySnap());
    mockSquadsQueryGet.mockResolvedValueOnce(snapOf(squad));

    const result = await detectGroupWorkouts(UID, NOW_WORKOUT);

    expect(result).toEqual([]);
    expect(mockGroupWorkoutsDocSet).not.toHaveBeenCalled();
    expect(mockWorkoutsQueryGet).not.toHaveBeenCalled();
  });

  it('handles 3-member squad — does not create group workout if one member is inactive', async () => {
    const USER_C = 'user-c';
    const squad = {
      id: SQUAD_ID,
      name: 'Big Squad',
      adminUid: UID,
      memberUids: [UID, PARTNER_UID, USER_C],
      settings: { onlyAdminsCanAddMembers: false },
      createdAt: '',
    };

    mockBuddiesQueryGet.mockResolvedValueOnce(emptySnap());
    mockBuddiesQueryGet.mockResolvedValueOnce(emptySnap());
    mockSquadsQueryGet.mockResolvedValueOnce(snapOf(squad));
    mockWorkoutsQueryGet.mockResolvedValueOnce(snapOf(PARTNER_WORKOUT)); // user-b active
    mockWorkoutsQueryGet.mockResolvedValueOnce(emptySnap()); // user-c NOT active

    const result = await detectGroupWorkouts(UID, NOW_WORKOUT);

    expect(result).toEqual([]);
    expect(mockGroupWorkoutsDocSet).not.toHaveBeenCalled();
  });

  it('handles 3-member squad — creates group workout when all members are active', async () => {
    const USER_C = 'user-c';
    const squad = {
      id: SQUAD_ID,
      name: 'Big Squad',
      adminUid: UID,
      memberUids: [UID, PARTNER_UID, USER_C],
      settings: { onlyAdminsCanAddMembers: false },
      createdAt: '',
    };
    const workoutC: Workout = { id: 'workout-c', uid: USER_C, type: 'HIIT', startedAt: new Date().toISOString(), status: 'active' };

    mockBuddiesQueryGet.mockResolvedValueOnce(emptySnap());
    mockBuddiesQueryGet.mockResolvedValueOnce(emptySnap());
    mockSquadsQueryGet.mockResolvedValueOnce(snapOf(squad));
    mockWorkoutsQueryGet.mockResolvedValueOnce(snapOf(PARTNER_WORKOUT)); // user-b active
    mockWorkoutsQueryGet.mockResolvedValueOnce(snapOf(workoutC)); // user-c active
    mockGroupWorkoutsQueryGet.mockResolvedValueOnce(emptySnap()); // no existing
    mockGroupWorkoutsDocSet.mockResolvedValueOnce(undefined);

    const result = await detectGroupWorkouts(UID, NOW_WORKOUT);

    expect(result).toHaveLength(1);
    expect(result[0].type).toBe('squad');
    expect(result[0].workoutIds).toHaveLength(3);
    expect(result[0].workoutIds).toContain(NOW_WORKOUT.id);
    expect(result[0].workoutIds).toContain(PARTNER_WORKOUT.id);
    expect(result[0].workoutIds).toContain(workoutC.id);
  });
});

// ── Combined buddy + squad ─────────────────────────────────────────────────────

describe('combined buddy and squad detection', () => {
  it('creates both a buddy and a squad group workout when both qualify', async () => {
    const buddy = { id: BUDDY_ID, uid1: UID, uid2: PARTNER_UID, createdAt: '' };
    const squad = {
      id: SQUAD_ID,
      name: 'Fire Crew',
      adminUid: UID,
      memberUids: [UID, 'user-c'],
      settings: { onlyAdminsCanAddMembers: false },
      createdAt: '',
    };
    const workoutC: Workout = { id: 'workout-c', uid: 'user-c', type: 'Yoga', startedAt: new Date().toISOString(), status: 'active' };

    mockBuddiesQueryGet.mockResolvedValueOnce(snapOf(buddy));
    mockBuddiesQueryGet.mockResolvedValueOnce(emptySnap());
    // buddy partner workout check
    mockWorkoutsQueryGet.mockResolvedValueOnce(snapOf(PARTNER_WORKOUT));
    // buddy dedup
    mockGroupWorkoutsQueryGet.mockResolvedValueOnce(emptySnap());
    mockGroupWorkoutsDocSet.mockResolvedValueOnce(undefined);

    mockSquadsQueryGet.mockResolvedValueOnce(snapOf(squad));
    // squad member (user-c) workout check
    mockWorkoutsQueryGet.mockResolvedValueOnce(snapOf(workoutC));
    // squad dedup
    mockGroupWorkoutsQueryGet.mockResolvedValueOnce(emptySnap());
    mockGroupWorkoutsDocSet.mockResolvedValueOnce(undefined);

    const result = await detectGroupWorkouts(UID, NOW_WORKOUT);

    expect(result).toHaveLength(2);
    const types = result.map((gw) => gw.type);
    expect(types).toContain('buddy');
    expect(types).toContain('squad');
    expect(mockGroupWorkoutsDocSet).toHaveBeenCalledTimes(2);
  });
});
