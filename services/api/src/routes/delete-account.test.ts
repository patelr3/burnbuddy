import { describe, it, expect, vi, beforeEach } from 'vitest';
import 'express-async-errors';
import express from 'express';
import type { Request, Response, NextFunction } from 'express';
import request from 'supertest';

/* ------------------------------------------------------------------ */
/*  vi.hoisted – declare all mock functions before module resolution  */
/* ------------------------------------------------------------------ */
const {
  mockVerifyIdToken,
  mockDeleteUser,
  mockCollectionGet,
  mockDocGet,
  mockDocDelete,
  mockDocUpdate,
  mockBatchDelete,
  mockBatchCommit,
  mockStorageDelete,
  mockStorageFile,
  mockStorageBucket,
  mockArrayRemove,
} = vi.hoisted(() => {
  return {
    mockVerifyIdToken: vi.fn(),
    mockDeleteUser: vi.fn(),
    mockCollectionGet: vi.fn(),
    mockDocGet: vi.fn(),
    mockDocDelete: vi.fn(),
    mockDocUpdate: vi.fn(),
    mockBatchDelete: vi.fn(),
    mockBatchCommit: vi.fn(),
    mockStorageDelete: vi.fn(),
    mockStorageFile: vi.fn(),
    mockStorageBucket: vi.fn(),
    mockArrayRemove: vi.fn(),
  };
});

/* ------------------------------------------------------------------ */
/*  vi.mock – wire up mocks for all modules users.ts imports          */
/* ------------------------------------------------------------------ */
vi.mock('../lib/firebase', () => ({
  admin: {
    auth: () => ({
      verifyIdToken: mockVerifyIdToken,
      deleteUser: mockDeleteUser,
    }),
    firestore: {
      FieldValue: {
        arrayRemove: mockArrayRemove,
        delete: vi.fn(() => '__FIELD_DELETE_SENTINEL__'),
        serverTimestamp: vi.fn(() => '__SERVER_TS__'),
      },
    },
    storage: () => ({ bucket: vi.fn() }),
  },
  initFirebase: vi.fn(),
}));

vi.mock('../lib/storage', () => ({
  getStorageBucket: mockStorageBucket,
}));

vi.mock('../lib/firestore', () => {
  /* Build a fake Firestore that tracks calls per-collection */
  const getDb = () => ({
    collection: (name: string) => ({
      where: (..._args: unknown[]) => ({ get: () => mockCollectionGet(name, ..._args) }),
      doc: (id: string) => ({
        get: () => mockDocGet(name, id),
        delete: () => mockDocDelete(name, id),
        update: (data: unknown) => mockDocUpdate(name, id, data),
        ref: { path: `${name}/${id}` },
      }),
    }),
    batch: () => ({
      delete: mockBatchDelete,
      commit: mockBatchCommit,
    }),
  });
  return { getDb };
});

vi.mock('../lib/anime-filter', () => ({ animeFilter: vi.fn() }));
vi.mock('../lib/username', () => ({
  generateUniqueUsername: vi.fn(),
  validateUsername: vi.fn(),
}));
vi.mock('../services/streak-calculator', () => ({
  calculateStreaks: vi.fn(() => ({ burnStreak: 0 })),
  calculateHighestStreakEver: vi.fn(() => ({ value: 0 })),
}));
vi.mock('../lib/logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn(), child: vi.fn(() => ({ info: vi.fn(), error: vi.fn() })) },
}));

/* ------------------------------------------------------------------ */
/*  Import the router *after* all mocks are in place                  */
/* ------------------------------------------------------------------ */
import usersRouter from './users';

/* ------------------------------------------------------------------ */
/*  Helpers                                                           */
/* ------------------------------------------------------------------ */
function buildApp() {
  const app = express();
  app.use(express.json());
  app.use('/users', usersRouter);
  app.use((err: unknown, _req: Request, res: Response, _next: NextFunction) => {
    res.status(500).json({ error: 'Internal Server Error' });
  });
  return app;
}

const VALID_TOKEN = 'Bearer valid.token';
const TEST_UID = 'test-uid-001';
const TEST_USERNAME = 'testuser';

/** Creates a Firestore query snapshot from an array of doc-like objects */
function makeSnap(docs: Array<{ id: string; data: Record<string, unknown> }> = []) {
  return {
    empty: docs.length === 0,
    docs: docs.map((d) => ({
      id: d.id,
      data: () => d.data,
      ref: {
        path: `col/${d.id}`,
        delete: mockDocDelete.bind(null, 'ref', d.id),
        update: (payload: unknown) => mockDocUpdate('ref', d.id, payload),
      },
    })),
  };
}

/* ------------------------------------------------------------------ */
/*  beforeEach – reset and wire up default "happy path" mocks         */
/* ------------------------------------------------------------------ */
beforeEach(() => {
  vi.resetAllMocks();

  // Auth
  mockVerifyIdToken.mockResolvedValue({ uid: TEST_UID });
  mockDeleteUser.mockResolvedValue(undefined);

  // Storage
  mockStorageDelete.mockResolvedValue(undefined);
  mockStorageFile.mockReturnValue({ delete: mockStorageDelete });
  mockStorageBucket.mockReturnValue({ file: mockStorageFile });

  // arrayRemove sentinel
  mockArrayRemove.mockReturnValue('__ARRAY_REMOVE__');

  // Firestore batch
  mockBatchCommit.mockResolvedValue(undefined);

  // Default: user is not admin of any squads
  // Default: user profile exists with a username
  // Default: all other collection queries return empty
  mockCollectionGet.mockImplementation((collection: string, ..._args: unknown[]) => {
    if (collection === 'burnSquads') {
      // Second call (memberUids array-contains) may also hit here
      return Promise.resolve(makeSnap());
    }
    return Promise.resolve(makeSnap());
  });

  mockDocGet.mockImplementation((collection: string, _id: string) => {
    if (collection === 'users') {
      return Promise.resolve({
        exists: true,
        data: () => ({ usernameLower: TEST_USERNAME }),
      });
    }
    return Promise.resolve({ exists: false, data: () => undefined });
  });

  mockDocDelete.mockResolvedValue(undefined);
  mockDocUpdate.mockResolvedValue(undefined);
});

/* ================================================================== */
/*  Tests                                                             */
/* ================================================================== */
describe('DELETE /users/me', () => {
  it('returns 401 when no Authorization header is provided', async () => {
    const res = await request(buildApp()).delete('/users/me');
    expect(res.status).toBe(401);
  });

  it('returns 409 with squad names when user is admin of BurnSquads', async () => {
    mockCollectionGet.mockImplementation((collection: string, field: string) => {
      if (collection === 'burnSquads' && field === 'adminUid') {
        return Promise.resolve(
          makeSnap([
            { id: 'squad1', data: { name: 'Morning Runners', adminUid: TEST_UID, memberUids: [] } },
            { id: 'squad2', data: { name: 'Gym Crew', adminUid: TEST_UID, memberUids: [] } },
          ]),
        );
      }
      return Promise.resolve(makeSnap());
    });

    const res = await request(buildApp())
      .delete('/users/me')
      .set('Authorization', VALID_TOKEN);

    expect(res.status).toBe(409);
    expect(res.body).toEqual({
      error: 'Must transfer or delete squads first',
      squads: ['Morning Runners', 'Gym Crew'],
    });

    // Should NOT have deleted auth user
    expect(mockDeleteUser).not.toHaveBeenCalled();
  });

  it('returns 200 and calls deleteUser on Firebase Auth on successful deletion', async () => {
    const res = await request(buildApp())
      .delete('/users/me')
      .set('Authorization', VALID_TOKEN);

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ deleted: true });
    expect(mockDeleteUser).toHaveBeenCalledWith(TEST_UID);
  });

  it('deletes users/{uid} and usernames/{usernameLower} documents', async () => {
    await request(buildApp())
      .delete('/users/me')
      .set('Authorization', VALID_TOKEN);

    expect(mockDocDelete).toHaveBeenCalledWith('users', TEST_UID);
    expect(mockDocDelete).toHaveBeenCalledWith('usernames', TEST_USERNAME);
  });

  it('skips username reservation delete when profile has no usernameLower', async () => {
    mockDocGet.mockImplementation((collection: string) => {
      if (collection === 'users') {
        return Promise.resolve({
          exists: false,
          data: () => undefined,
        });
      }
      return Promise.resolve({ exists: false, data: () => undefined });
    });

    const res = await request(buildApp())
      .delete('/users/me')
      .set('Authorization', VALID_TOKEN);

    expect(res.status).toBe(200);
    // usernames doc should NOT have been deleted
    const usernamesDeleteCalls = mockDocDelete.mock.calls.filter(
      (args) => args[0] === 'usernames',
    );
    expect(usernamesDeleteCalls).toHaveLength(0);
  });

  it('batch deletes workouts, friends, friendRequests, burnBuddies, burnBuddyRequests, and burnSquadJoinRequests', async () => {
    // Return some docs for each batchDeleteQuery call
    mockCollectionGet.mockImplementation((collection: string, field: string) => {
      if (collection === 'burnSquads' && field === 'adminUid') {
        return Promise.resolve(makeSnap());
      }
      if (collection === 'burnSquads') {
        // memberUids query
        return Promise.resolve(makeSnap());
      }
      if (collection === 'groupWorkouts') {
        return Promise.resolve(makeSnap());
      }
      // Return 1 doc for each other collection query to trigger batch deletes
      return Promise.resolve(
        makeSnap([{ id: `${collection}-doc1`, data: { uid: TEST_UID } }]),
      );
    });

    await request(buildApp())
      .delete('/users/me')
      .set('Authorization', VALID_TOKEN);

    // Verify batch delete was called for each collection's documents
    // workouts, friends (x2), friendRequests (x2), burnBuddies (x2), burnBuddyRequests (x2), burnSquadJoinRequests
    expect(mockBatchDelete).toHaveBeenCalled();
    expect(mockBatchCommit).toHaveBeenCalled();

    // Verify all expected collection queries were made
    const queryCollections = mockCollectionGet.mock.calls.map((args) => args[0] as string);
    expect(queryCollections).toContain('workouts');
    expect(queryCollections).toContain('friends');
    expect(queryCollections).toContain('friendRequests');
    expect(queryCollections).toContain('burnBuddies');
    expect(queryCollections).toContain('burnBuddyRequests');
    expect(queryCollections).toContain('burnSquadJoinRequests');
  });

  it('deletes profile picture from Storage', async () => {
    await request(buildApp())
      .delete('/users/me')
      .set('Authorization', VALID_TOKEN);

    expect(mockStorageFile).toHaveBeenCalledWith(`profile-pictures/${TEST_UID}/avatar.webp`);
    expect(mockStorageDelete).toHaveBeenCalled();
  });

  it('ignores 404 errors when deleting profile picture', async () => {
    mockStorageDelete.mockRejectedValueOnce({ code: 404 });

    const res = await request(buildApp())
      .delete('/users/me')
      .set('Authorization', VALID_TOKEN);

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ deleted: true });
  });

  it('calls Firebase Auth deleteUser as the FINAL step (after all Firestore cleanup)', async () => {
    const callOrder: string[] = [];

    mockDocDelete.mockImplementation((..._args: unknown[]) => {
      callOrder.push('firestore-delete');
      return Promise.resolve(undefined);
    });

    mockStorageDelete.mockImplementation(() => {
      callOrder.push('storage-delete');
      return Promise.resolve(undefined);
    });

    mockDeleteUser.mockImplementation(() => {
      callOrder.push('auth-delete');
      return Promise.resolve(undefined);
    });

    await request(buildApp())
      .delete('/users/me')
      .set('Authorization', VALID_TOKEN);

    // Auth delete must be LAST in the call order
    expect(callOrder.at(-1)).toBe('auth-delete');
    // There must be firestore operations before auth delete
    expect(callOrder.filter((c) => c === 'firestore-delete').length).toBeGreaterThan(0);
  });

  it('removes user from non-admin squad memberUids via arrayRemove', async () => {
    mockCollectionGet.mockImplementation((collection: string, field: string) => {
      if (collection === 'burnSquads' && field === 'adminUid') {
        return Promise.resolve(makeSnap()); // not admin
      }
      if (collection === 'burnSquads' && field === 'memberUids') {
        return Promise.resolve(
          makeSnap([
            { id: 'squad-x', data: { name: 'Yoga Squad', adminUid: 'other', memberUids: [TEST_UID, 'other'] } },
          ]),
        );
      }
      if (collection === 'groupWorkouts') {
        return Promise.resolve(makeSnap());
      }
      return Promise.resolve(makeSnap());
    });

    await request(buildApp())
      .delete('/users/me')
      .set('Authorization', VALID_TOKEN);

    expect(mockArrayRemove).toHaveBeenCalledWith(TEST_UID);
    expect(mockDocUpdate).toHaveBeenCalledWith('ref', 'squad-x', { memberUids: '__ARRAY_REMOVE__' });
  });

  it('deletes group workout when removing user would leave fewer than 2 members', async () => {
    mockCollectionGet.mockImplementation((collection: string, field: string) => {
      if (collection === 'burnSquads') {
        return Promise.resolve(makeSnap());
      }
      if (collection === 'groupWorkouts') {
        return Promise.resolve(
          makeSnap([
            { id: 'gw-1', data: { memberUids: [TEST_UID, 'other-uid'] } },
          ]),
        );
      }
      return Promise.resolve(makeSnap());
    });

    await request(buildApp())
      .delete('/users/me')
      .set('Authorization', VALID_TOKEN);

    // Only 1 member remains after removing TEST_UID → should delete
    expect(mockDocDelete).toHaveBeenCalledWith('ref', 'gw-1');
  });

  it('updates group workout memberUids when 2+ members remain', async () => {
    mockCollectionGet.mockImplementation((collection: string, field: string) => {
      if (collection === 'burnSquads') {
        return Promise.resolve(makeSnap());
      }
      if (collection === 'groupWorkouts') {
        return Promise.resolve(
          makeSnap([
            { id: 'gw-2', data: { memberUids: [TEST_UID, 'uid-a', 'uid-b'] } },
          ]),
        );
      }
      return Promise.resolve(makeSnap());
    });

    await request(buildApp())
      .delete('/users/me')
      .set('Authorization', VALID_TOKEN);

    // 2 members remain → should update, not delete
    expect(mockArrayRemove).toHaveBeenCalledWith(TEST_UID);
    expect(mockDocUpdate).toHaveBeenCalledWith('ref', 'gw-2', { memberUids: '__ARRAY_REMOVE__' });
  });

  it('continues cleanup even when individual collection deletions fail', async () => {
    // Make workouts query fail
    mockCollectionGet.mockImplementation((collection: string, field: string) => {
      if (collection === 'burnSquads') {
        return Promise.resolve(makeSnap());
      }
      if (collection === 'workouts') {
        return Promise.reject(new Error('Firestore unavailable'));
      }
      if (collection === 'groupWorkouts') {
        return Promise.resolve(makeSnap());
      }
      return Promise.resolve(makeSnap());
    });

    const res = await request(buildApp())
      .delete('/users/me')
      .set('Authorization', VALID_TOKEN);

    // Should still succeed — errors are swallowed
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ deleted: true });
    // Auth user should still be deleted
    expect(mockDeleteUser).toHaveBeenCalledWith(TEST_UID);
  });
});
