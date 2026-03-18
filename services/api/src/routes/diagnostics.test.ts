import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import express from 'express';
import request from 'supertest';

const {
  mockVerifyIdToken,
  mockContainerExists,
  mockGetContainerClient,
  mockLoggerError,
  // Firestore collection mocks for relationship diagnostics
  mockBBRequestsGet,
  mockBBRequestsQueryChain,
  mockFriendRequestsGet,
  mockFriendRequestsQueryChain,
  mockBBGet,
  mockFriendsGet,
  mockUsersGet,
} = vi.hoisted(() => {
  const mockVerifyIdToken = vi.fn();
  const mockContainerExists = vi.fn();
  const mockGetContainerClient = vi.fn(() => ({
    exists: mockContainerExists,
  }));
  const mockLoggerError = vi.fn();

  // Firestore query mocks for relationship diagnostics
  const mockBBRequestsGet = vi.fn();
  const mockBBRequestsQueryChain = {
    where: vi.fn(),
    get: mockBBRequestsGet,
  };

  const mockFriendRequestsGet = vi.fn();
  const mockFriendRequestsQueryChain = {
    where: vi.fn(),
    get: mockFriendRequestsGet,
  };

  const mockBBGet = vi.fn();
  const mockFriendsGet = vi.fn();
  const mockUsersGet = vi.fn();

  return {
    mockVerifyIdToken,
    mockContainerExists,
    mockGetContainerClient,
    mockLoggerError,
    mockBBRequestsGet,
    mockBBRequestsQueryChain,
    mockFriendRequestsGet,
    mockFriendRequestsQueryChain,
    mockBBGet,
    mockFriendsGet,
    mockUsersGet,
  };
});

vi.mock('../lib/firebase', () => ({
  admin: {
    auth: () => ({ verifyIdToken: mockVerifyIdToken }),
  },
  initFirebase: vi.fn(),
}));

vi.mock('../lib/storage', () => ({
  getContainerClient: mockGetContainerClient,
}));

vi.mock('../lib/firestore', () => ({
  getDb: () => ({
    collection: (name: string) => {
      if (name === 'burnBuddyRequests') {
        return { where: () => mockBBRequestsQueryChain };
      }
      if (name === 'friendRequests') {
        return { where: () => mockFriendRequestsQueryChain };
      }
      if (name === 'burnBuddies') {
        return { get: mockBBGet };
      }
      if (name === 'friends') {
        return { get: mockFriendsGet };
      }
      if (name === 'users') {
        return { get: mockUsersGet };
      }
      return {};
    },
  }),
}));

vi.mock('sharp', () => ({
  default: {
    versions: { sharp: '0.34.5' },
    format: {
      heif: {
        input: {
          buffer: true,
          fileSuffix: ['.heic', '.heif', '.avif'],
        },
      },
    },
  },
}));

vi.mock('../lib/logger', () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: mockLoggerError,
    debug: vi.fn(),
    child: vi.fn(() => ({
      info: vi.fn(),
      warn: vi.fn(),
      error: mockLoggerError,
      debug: vi.fn(),
    })),
  },
}));

import diagnosticsRouter from './diagnostics';

function buildApp() {
  const app = express();
  app.use(express.json());
  app.use('/diagnostics', diagnosticsRouter);
  return app;
}

const VALID_TOKEN = 'Bearer valid.token';
const TEST_UID = 'test-uid-001';

let savedEnv: Record<string, string | undefined>;

beforeEach(() => {
  vi.resetAllMocks();

  savedEnv = {
    AZURE_STORAGE_ACCOUNT_URL: process.env.AZURE_STORAGE_ACCOUNT_URL,
  };

  mockVerifyIdToken.mockResolvedValue({ uid: TEST_UID });
  mockContainerExists.mockResolvedValue(true);
  mockGetContainerClient.mockReturnValue({ exists: mockContainerExists });

  // Re-setup query chains after resetAllMocks
  mockBBRequestsQueryChain.where.mockReturnThis();
  mockFriendRequestsQueryChain.where.mockReturnThis();
});

afterEach(() => {
  for (const [key, value] of Object.entries(savedEnv)) {
    if (value === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = value;
    }
  }
});

describe('GET /diagnostics', () => {
  it('returns 401 when unauthenticated', async () => {
    const res = await request(buildApp()).get('/diagnostics');
    expect(res.status).toBe(401);
  });

  it('returns 200 with sharp and storage info when authenticated', async () => {
    process.env.AZURE_STORAGE_ACCOUNT_URL = 'https://burnbuddybetasa.blob.core.windows.net';

    const res = await request(buildApp())
      .get('/diagnostics')
      .set('Authorization', VALID_TOKEN);

    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      sharp: {
        version: '0.34.5',
        heifSupport: true,
        heifFileSuffixes: ['.heic', '.heif', '.avif'],
      },
      storage: {
        storageAccountUrl: 'https://burnbuddybetasa.blob.core.windows.net',
        containerName: 'uploads',
        containerExists: true,
      },
    });
  });

  it('returns partial results with error field when exists() throws', async () => {
    mockContainerExists.mockRejectedValueOnce(new Error('container access denied'));

    const res = await request(buildApp())
      .get('/diagnostics')
      .set('Authorization', VALID_TOKEN);

    expect(res.status).toBe(200);

    // Sharp section should still be populated
    expect(res.body.sharp).toEqual({
      version: '0.34.5',
      heifSupport: true,
      heifFileSuffixes: ['.heic', '.heif', '.avif'],
    });

    // Storage section should contain error, not crash the whole response
    expect(res.body.storage).toEqual({
      error: 'Failed to check container',
    });
  });

  it('returns storage error when getContainerClient throws', async () => {
    mockGetContainerClient.mockImplementationOnce(() => {
      throw new Error('storage not initialized');
    });

    const res = await request(buildApp())
      .get('/diagnostics')
      .set('Authorization', VALID_TOKEN);

    expect(res.status).toBe(200);
    expect(res.body.sharp.version).toBe('0.34.5');
    expect(res.body.storage).toEqual({
      error: 'Failed to check container',
    });
  });
});

// ---------------------------------------------------------------------------
// Relationship diagnostics helpers
// ---------------------------------------------------------------------------

function mockDoc(id: string, data: Record<string, unknown>) {
  return { id, data: () => data };
}

function emptySnap() {
  return { docs: [], size: 0 };
}

function setupRelationshipMocks({
  bbRequests = emptySnap(),
  friendRequests = emptySnap(),
  burnBuddies = emptySnap(),
  friends = emptySnap(),
  users = emptySnap(),
}: {
  bbRequests?: { docs: ReturnType<typeof mockDoc>[]; size: number };
  friendRequests?: { docs: ReturnType<typeof mockDoc>[]; size: number };
  burnBuddies?: { docs: ReturnType<typeof mockDoc>[]; size: number };
  friends?: { docs: ReturnType<typeof mockDoc>[]; size: number };
  users?: { docs: ReturnType<typeof mockDoc>[]; size: number };
}) {
  mockBBRequestsGet.mockResolvedValue(bbRequests);
  mockFriendRequestsGet.mockResolvedValue(friendRequests);
  mockBBGet.mockResolvedValue(burnBuddies);
  mockFriendsGet.mockResolvedValue(friends);
  mockUsersGet.mockResolvedValue(users);
}

// ---------------------------------------------------------------------------
// GET /diagnostics/relationships
// ---------------------------------------------------------------------------

describe('GET /diagnostics/relationships', () => {
  it('returns 401 when unauthenticated', async () => {
    const res = await request(buildApp()).get('/diagnostics/relationships');
    expect(res.status).toBe(401);
  });

  it('returns clean report when no issues exist', async () => {
    setupRelationshipMocks({
      users: {
        docs: [mockDoc('uid-a', {}), mockDoc('uid-b', {})],
        size: 2,
      },
      bbRequests: {
        docs: [
          mockDoc('bbr-1', { fromUid: 'uid-a', toUid: 'uid-b', status: 'pending' }),
        ],
        size: 1,
      },
      burnBuddies: { docs: [], size: 0 },
      friends: { docs: [], size: 0 },
      friendRequests: { docs: [], size: 0 },
    });

    const res = await request(buildApp())
      .get('/diagnostics/relationships')
      .set('Authorization', VALID_TOKEN);

    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      orphanPendingBBRequests: { count: 0, ids: [] },
      orphanPendingFriendRequests: { count: 0, ids: [] },
      bbWithoutFriendship: { count: 0, ids: [] },
      invalidUidRequests: { count: 0, ids: [] },
      totalScanned: 1,
    });
  });

  it('detects orphan pending burnBuddyRequests', async () => {
    setupRelationshipMocks({
      users: {
        docs: [mockDoc('uid-a', {}), mockDoc('uid-b', {})],
        size: 2,
      },
      bbRequests: {
        docs: [
          mockDoc('bbr-orphan', { fromUid: 'uid-a', toUid: 'uid-b', status: 'pending' }),
        ],
        size: 1,
      },
      burnBuddies: {
        docs: [mockDoc('uid-a_uid-b', { uid1: 'uid-a', uid2: 'uid-b' })],
        size: 1,
      },
      friends: {
        docs: [mockDoc('uid-a_uid-b', { uid1: 'uid-a', uid2: 'uid-b' })],
        size: 1,
      },
    });

    const res = await request(buildApp())
      .get('/diagnostics/relationships')
      .set('Authorization', VALID_TOKEN);

    expect(res.status).toBe(200);
    expect(res.body.orphanPendingBBRequests.count).toBe(1);
    expect(res.body.orphanPendingBBRequests.ids).toEqual(['bbr-orphan']);
  });

  it('detects orphan pending friendRequests', async () => {
    setupRelationshipMocks({
      users: {
        docs: [mockDoc('uid-a', {}), mockDoc('uid-b', {})],
        size: 2,
      },
      friendRequests: {
        docs: [
          mockDoc('fr-orphan', { fromUid: 'uid-b', toUid: 'uid-a', status: 'pending' }),
        ],
        size: 1,
      },
      friends: {
        docs: [mockDoc('uid-a_uid-b', { uid1: 'uid-a', uid2: 'uid-b' })],
        size: 1,
      },
    });

    const res = await request(buildApp())
      .get('/diagnostics/relationships')
      .set('Authorization', VALID_TOKEN);

    expect(res.status).toBe(200);
    expect(res.body.orphanPendingFriendRequests.count).toBe(1);
    expect(res.body.orphanPendingFriendRequests.ids).toEqual(['fr-orphan']);
  });

  it('detects burnBuddies without corresponding friend document', async () => {
    setupRelationshipMocks({
      users: {
        docs: [mockDoc('uid-a', {}), mockDoc('uid-b', {})],
        size: 2,
      },
      burnBuddies: {
        docs: [mockDoc('uid-a_uid-b', { uid1: 'uid-a', uid2: 'uid-b' })],
        size: 1,
      },
      friends: { docs: [], size: 0 },
    });

    const res = await request(buildApp())
      .get('/diagnostics/relationships')
      .set('Authorization', VALID_TOKEN);

    expect(res.status).toBe(200);
    expect(res.body.bbWithoutFriendship.count).toBe(1);
    expect(res.body.bbWithoutFriendship.ids).toEqual(['uid-a_uid-b']);
  });

  it('detects requests with non-existent user profiles', async () => {
    setupRelationshipMocks({
      users: {
        docs: [mockDoc('uid-a', {})],
        size: 1,
      },
      bbRequests: {
        docs: [
          mockDoc('bbr-bad', { fromUid: 'uid-a', toUid: 'uid-ghost', status: 'pending' }),
        ],
        size: 1,
      },
      friendRequests: {
        docs: [
          mockDoc('fr-bad', { fromUid: 'uid-phantom', toUid: 'uid-a', status: 'pending' }),
        ],
        size: 1,
      },
    });

    const res = await request(buildApp())
      .get('/diagnostics/relationships')
      .set('Authorization', VALID_TOKEN);

    expect(res.status).toBe(200);
    expect(res.body.invalidUidRequests.count).toBe(2);
    expect(res.body.invalidUidRequests.ids).toContain('bbr-bad');
    expect(res.body.invalidUidRequests.ids).toContain('fr-bad');
  });

  it('caps IDs at 50 per category', async () => {
    // Create 60 orphan BB requests
    const docs = Array.from({ length: 60 }, (_, i) =>
      mockDoc(`bbr-${i}`, { fromUid: 'uid-a', toUid: 'uid-b', status: 'pending' }),
    );

    setupRelationshipMocks({
      users: {
        docs: [mockDoc('uid-a', {}), mockDoc('uid-b', {})],
        size: 2,
      },
      bbRequests: { docs, size: 60 },
      burnBuddies: {
        docs: [mockDoc('uid-a_uid-b', { uid1: 'uid-a', uid2: 'uid-b' })],
        size: 1,
      },
      friends: {
        docs: [mockDoc('uid-a_uid-b', { uid1: 'uid-a', uid2: 'uid-b' })],
        size: 1,
      },
    });

    const res = await request(buildApp())
      .get('/diagnostics/relationships')
      .set('Authorization', VALID_TOKEN);

    expect(res.status).toBe(200);
    expect(res.body.orphanPendingBBRequests.count).toBe(60);
    expect(res.body.orphanPendingBBRequests.ids).toHaveLength(50);
  });

  it('detects multiple issue types simultaneously', async () => {
    setupRelationshipMocks({
      users: {
        docs: [mockDoc('uid-a', {}), mockDoc('uid-b', {})],
        size: 2,
      },
      bbRequests: {
        docs: [
          mockDoc('bbr-orphan', { fromUid: 'uid-a', toUid: 'uid-b', status: 'pending' }),
          mockDoc('bbr-invalid', { fromUid: 'uid-a', toUid: 'uid-gone', status: 'pending' }),
        ],
        size: 2,
      },
      friendRequests: { docs: [], size: 0 },
      burnBuddies: {
        docs: [
          mockDoc('uid-a_uid-b', { uid1: 'uid-a', uid2: 'uid-b' }),
          mockDoc('uid-a_uid-c', { uid1: 'uid-a', uid2: 'uid-c' }),
        ],
        size: 2,
      },
      friends: {
        docs: [mockDoc('uid-a_uid-b', { uid1: 'uid-a', uid2: 'uid-b' })],
        size: 1,
      },
    });

    const res = await request(buildApp())
      .get('/diagnostics/relationships')
      .set('Authorization', VALID_TOKEN);

    expect(res.status).toBe(200);
    // bbr-orphan: BB exists for uid-a_uid-b
    expect(res.body.orphanPendingBBRequests.count).toBe(1);
    // uid-a_uid-c BB has no friend doc
    expect(res.body.bbWithoutFriendship.count).toBe(1);
    // bbr-invalid references uid-gone (not in users)
    expect(res.body.invalidUidRequests.count).toBe(1);
    expect(res.body.totalScanned).toBe(4); // 2 BB requests + 0 friend requests + 2 burn buddies
  });

  it('returns 500 when Firestore query fails', async () => {
    mockBBRequestsGet.mockRejectedValue(new Error('Firestore unavailable'));
    mockFriendRequestsGet.mockResolvedValue(emptySnap());
    mockBBGet.mockResolvedValue(emptySnap());
    mockFriendsGet.mockResolvedValue(emptySnap());
    mockUsersGet.mockResolvedValue(emptySnap());

    const res = await request(buildApp())
      .get('/diagnostics/relationships')
      .set('Authorization', VALID_TOKEN);

    expect(res.status).toBe(500);
    expect(res.body.error).toBe('Failed to scan relationship integrity');
    expect(mockLoggerError).toHaveBeenCalled();
  });
});
