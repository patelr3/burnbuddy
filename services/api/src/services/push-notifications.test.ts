import { describe, it, expect, vi, beforeEach } from 'vitest';

// vi.hoisted ensures mock variables are created before the mock factory runs
const {
  mockSendEachForMulticast,
  // burnBuddies
  mockBuddiesQueryGet,
  mockBuddiesQueryChain,
  // burnSquads
  mockSquadsQueryGet,
  mockSquadsQueryChain,
  // users (doc.get per uid)
  mockUsersDocGet,
  mockUsersDocRef,
} = vi.hoisted(() => {
  const mockSendEachForMulticast = vi.fn();

  const mockBuddiesQueryGet = vi.fn();
  const mockBuddiesQueryChain = { where: vi.fn(), get: mockBuddiesQueryGet };

  const mockSquadsQueryGet = vi.fn();
  const mockSquadsQueryChain = { where: vi.fn(), get: mockSquadsQueryGet };

  const mockUsersDocGet = vi.fn();
  const mockUsersDocRef = vi.fn(() => ({ get: mockUsersDocGet }));

  return {
    mockSendEachForMulticast,
    mockBuddiesQueryGet,
    mockBuddiesQueryChain,
    mockSquadsQueryGet,
    mockSquadsQueryChain,
    mockUsersDocGet,
    mockUsersDocRef,
  };
});

vi.mock('../lib/firebase', () => ({
  admin: {
    messaging: () => ({ sendEachForMulticast: mockSendEachForMulticast }),
  },
  initFirebase: vi.fn(),
}));

vi.mock('../lib/firestore', () => ({
  getDb: () => ({
    collection: (name: string) => {
      if (name === 'burnBuddies') {
        return { where: () => mockBuddiesQueryChain };
      }
      if (name === 'burnSquads') {
        return { where: () => mockSquadsQueryChain };
      }
      if (name === 'users') {
        return { doc: mockUsersDocRef };
      }
      return {};
    },
  }),
}));

import { sendWorkoutStartedNotifications } from './push-notifications';

const UID = 'user-a';
const PARTNER_UID = 'user-b';
const BUDDY_ID = 'buddy-001';
const SQUAD_ID = 'squad-001';

function emptySnap() {
  return { empty: true, docs: [] };
}

function snapOf(...items: object[]) {
  return {
    empty: items.length === 0,
    docs: items.map((data) => ({ data: () => data })),
  };
}

function profileDoc(uid: string, displayName: string, fcmToken?: string) {
  return {
    exists: true,
    data: () => ({ uid, email: `${uid}@test.com`, displayName, fcmToken, createdAt: '' }),
  };
}

function missingDoc() {
  return { exists: false };
}

beforeEach(() => {
  vi.resetAllMocks();

  mockBuddiesQueryChain.where.mockReturnThis();
  mockSquadsQueryChain.where.mockReturnThis();

  mockUsersDocRef.mockImplementation(() => ({ get: mockUsersDocGet }));
  mockSendEachForMulticast.mockResolvedValue({ responses: [] });
});

// ── No relationships ───────────────────────────────────────────────────────────

describe('no burn buddies and no burn squads', () => {
  it('does not call FCM when user has no relationships', async () => {
    mockBuddiesQueryGet.mockResolvedValueOnce(emptySnap()); // uid1
    mockBuddiesQueryGet.mockResolvedValueOnce(emptySnap()); // uid2
    mockSquadsQueryGet.mockResolvedValueOnce(emptySnap());

    await sendWorkoutStartedNotifications(UID, 'Alice');

    expect(mockSendEachForMulticast).not.toHaveBeenCalled();
  });
});

// ── FCM token filtering ────────────────────────────────────────────────────────

describe('fcm token filtering', () => {
  it('skips sending when all recipients have no fcmToken', async () => {
    const buddy = { id: BUDDY_ID, uid1: UID, uid2: PARTNER_UID, createdAt: '' };

    mockBuddiesQueryGet.mockResolvedValueOnce(snapOf(buddy));
    mockBuddiesQueryGet.mockResolvedValueOnce(emptySnap());
    mockSquadsQueryGet.mockResolvedValueOnce(emptySnap());

    // Partner has no fcmToken
    mockUsersDocGet.mockResolvedValueOnce(profileDoc(PARTNER_UID, 'Bob'));

    await sendWorkoutStartedNotifications(UID, 'Alice');

    expect(mockSendEachForMulticast).not.toHaveBeenCalled();
  });

  it('skips users with missing Firestore profile', async () => {
    const buddy = { id: BUDDY_ID, uid1: UID, uid2: PARTNER_UID, createdAt: '' };

    mockBuddiesQueryGet.mockResolvedValueOnce(snapOf(buddy));
    mockBuddiesQueryGet.mockResolvedValueOnce(emptySnap());
    mockSquadsQueryGet.mockResolvedValueOnce(emptySnap());

    mockUsersDocGet.mockResolvedValueOnce(missingDoc());

    await sendWorkoutStartedNotifications(UID, 'Alice');

    expect(mockSendEachForMulticast).not.toHaveBeenCalled();
  });
});

// ── Burn Buddy notifications ───────────────────────────────────────────────────

describe('burn buddy notifications', () => {
  it('sends notification to buddy with fcmToken', async () => {
    const buddy = { id: BUDDY_ID, uid1: UID, uid2: PARTNER_UID, createdAt: '' };

    mockBuddiesQueryGet.mockResolvedValueOnce(snapOf(buddy));
    mockBuddiesQueryGet.mockResolvedValueOnce(emptySnap());
    mockSquadsQueryGet.mockResolvedValueOnce(emptySnap());

    mockUsersDocGet.mockResolvedValueOnce(profileDoc(PARTNER_UID, 'Bob', 'token-bob'));

    await sendWorkoutStartedNotifications(UID, 'Alice');

    expect(mockSendEachForMulticast).toHaveBeenCalledOnce();
    const call = mockSendEachForMulticast.mock.calls[0][0] as {
      tokens: string[];
      notification: { title: string; body: string };
      data: { type: string; uid: string };
    };
    expect(call.tokens).toEqual(['token-bob']);
    expect(call.notification.title).toBe('Alice started a workout!');
    expect(call.notification.body).toBe('Jump in within 20 min to log a group workout');
    expect(call.data).toEqual({ type: 'WORKOUT_STARTED', uid: UID });
  });

  it('resolves partner uid correctly when current user is uid2', async () => {
    const OTHER_UID = 'user-c';
    // current user is uid2; partner is uid1
    const buddy = { id: BUDDY_ID, uid1: OTHER_UID, uid2: UID, createdAt: '' };

    mockBuddiesQueryGet.mockResolvedValueOnce(emptySnap()); // uid1 query — empty
    mockBuddiesQueryGet.mockResolvedValueOnce(snapOf(buddy)); // uid2 query — match
    mockSquadsQueryGet.mockResolvedValueOnce(emptySnap());

    mockUsersDocGet.mockResolvedValueOnce(profileDoc(OTHER_UID, 'Charlie', 'token-charlie'));

    await sendWorkoutStartedNotifications(UID, 'Alice');

    const call = mockSendEachForMulticast.mock.calls[0][0] as { tokens: string[] };
    expect(call.tokens).toEqual(['token-charlie']);
  });
});

// ── Burn Squad notifications ───────────────────────────────────────────────────

describe('burn squad notifications', () => {
  it('sends notifications to all squad members except the sender', async () => {
    const USER_C = 'user-c';
    const squad = {
      id: SQUAD_ID,
      name: 'Fire Crew',
      adminUid: UID,
      memberUids: [UID, PARTNER_UID, USER_C],
      settings: { onlyAdminsCanAddMembers: false },
      createdAt: '',
    };

    mockBuddiesQueryGet.mockResolvedValueOnce(emptySnap());
    mockBuddiesQueryGet.mockResolvedValueOnce(emptySnap());
    mockSquadsQueryGet.mockResolvedValueOnce(snapOf(squad));

    // Profiles fetched in order: PARTNER_UID, USER_C
    mockUsersDocGet.mockResolvedValueOnce(profileDoc(PARTNER_UID, 'Bob', 'token-bob'));
    mockUsersDocGet.mockResolvedValueOnce(profileDoc(USER_C, 'Carol', 'token-carol'));

    await sendWorkoutStartedNotifications(UID, 'Alice');

    const call = mockSendEachForMulticast.mock.calls[0][0] as { tokens: string[] };
    expect(call.tokens).toHaveLength(2);
    expect(call.tokens).toContain('token-bob');
    expect(call.tokens).toContain('token-carol');
  });
});

// ── Deduplication ──────────────────────────────────────────────────────────────

describe('recipient deduplication', () => {
  it('sends only one notification when the same user is both a buddy and a squad member', async () => {
    const buddy = { id: BUDDY_ID, uid1: UID, uid2: PARTNER_UID, createdAt: '' };
    const squad = {
      id: SQUAD_ID,
      name: 'Fire Crew',
      adminUid: UID,
      memberUids: [UID, PARTNER_UID], // PARTNER_UID is in both
      settings: { onlyAdminsCanAddMembers: false },
      createdAt: '',
    };

    mockBuddiesQueryGet.mockResolvedValueOnce(snapOf(buddy));
    mockBuddiesQueryGet.mockResolvedValueOnce(emptySnap());
    mockSquadsQueryGet.mockResolvedValueOnce(snapOf(squad));

    // Only one profile fetch (deduped Set)
    mockUsersDocGet.mockResolvedValueOnce(profileDoc(PARTNER_UID, 'Bob', 'token-bob'));

    await sendWorkoutStartedNotifications(UID, 'Alice');

    // Only one FCM call with one token
    expect(mockSendEachForMulticast).toHaveBeenCalledOnce();
    const call = mockSendEachForMulticast.mock.calls[0][0] as { tokens: string[] };
    expect(call.tokens).toHaveLength(1);
    expect(call.tokens).toEqual(['token-bob']);
  });
});

// ── Notification payload ───────────────────────────────────────────────────────

describe('notification payload', () => {
  it('uses the sender display name in the title', async () => {
    const buddy = { id: BUDDY_ID, uid1: UID, uid2: PARTNER_UID, createdAt: '' };

    mockBuddiesQueryGet.mockResolvedValueOnce(snapOf(buddy));
    mockBuddiesQueryGet.mockResolvedValueOnce(emptySnap());
    mockSquadsQueryGet.mockResolvedValueOnce(emptySnap());

    mockUsersDocGet.mockResolvedValueOnce(profileDoc(PARTNER_UID, 'Bob', 'token-bob'));

    await sendWorkoutStartedNotifications(UID, 'Rahul');

    const call = mockSendEachForMulticast.mock.calls[0][0] as {
      notification: { title: string };
    };
    expect(call.notification.title).toBe('Rahul started a workout!');
  });

  it('includes correct data payload with WORKOUT_STARTED type and sender uid', async () => {
    const buddy = { id: BUDDY_ID, uid1: UID, uid2: PARTNER_UID, createdAt: '' };

    mockBuddiesQueryGet.mockResolvedValueOnce(snapOf(buddy));
    mockBuddiesQueryGet.mockResolvedValueOnce(emptySnap());
    mockSquadsQueryGet.mockResolvedValueOnce(emptySnap());

    mockUsersDocGet.mockResolvedValueOnce(profileDoc(PARTNER_UID, 'Bob', 'token-bob'));

    await sendWorkoutStartedNotifications(UID, 'Alice');

    const call = mockSendEachForMulticast.mock.calls[0][0] as {
      data: { type: string; uid: string };
    };
    expect(call.data.type).toBe('WORKOUT_STARTED');
    expect(call.data.uid).toBe(UID);
  });
});
