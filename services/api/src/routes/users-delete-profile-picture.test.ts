import { describe, it, expect, vi, beforeEach } from 'vitest';
import 'express-async-errors';
import express from 'express';
import type { Request, Response, NextFunction } from 'express';
import request from 'supertest';

const {
  mockVerifyIdToken,
  mockUsersDocUpdate,
  mockUsersDocRef,
  mockStorageDelete,
  mockStorageFile,
  mockStorageBucket,
  mockFieldValueDelete,
} = vi.hoisted(() => {
  const mockVerifyIdToken = vi.fn();

  const mockUsersDocUpdate = vi.fn();
  const mockUsersDocRef = vi.fn(() => ({
    update: mockUsersDocUpdate,
  }));

  const mockStorageDelete = vi.fn();
  const mockStorageFile = vi.fn(() => ({
    delete: mockStorageDelete,
  }));
  const mockStorageBucket = vi.fn(() => ({
    file: mockStorageFile,
  }));

  const mockFieldValueDelete = vi.fn(() => '__FIELD_DELETE_SENTINEL__');

  return {
    mockVerifyIdToken,
    mockUsersDocUpdate,
    mockUsersDocRef,
    mockStorageDelete,
    mockStorageFile,
    mockStorageBucket,
    mockFieldValueDelete,
  };
});

vi.mock('../lib/firebase', () => ({
  admin: {
    auth: () => ({ verifyIdToken: mockVerifyIdToken }),
    storage: () => ({ bucket: mockStorageBucket }),
    firestore: {
      FieldValue: {
        delete: mockFieldValueDelete,
      },
    },
  },
  initFirebase: vi.fn(),
}));

vi.mock('../lib/firestore', () => ({
  getDb: () => ({
    collection: (name: string) => {
      if (name === 'users') {
        return { doc: mockUsersDocRef };
      }
      return {};
    },
  }),
}));

// Must also mock anime-filter since users.ts imports it
vi.mock('../lib/anime-filter', () => ({
  animeFilter: vi.fn(),
}));

// Must also mock username module since users.ts imports it
vi.mock('../lib/username', () => ({
  generateUniqueUsername: vi.fn(),
  validateUsername: vi.fn(),
}));

// Must also mock streak-calculator since users.ts imports it
vi.mock('../services/streak-calculator', () => ({
  calculateStreaks: vi.fn(() => ({ burnStreak: 0 })),
  calculateHighestStreakEver: vi.fn(() => ({ value: 0 })),
}));

import usersRouter from './users';

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

beforeEach(() => {
  vi.resetAllMocks();

  mockVerifyIdToken.mockResolvedValue({ uid: TEST_UID });
  mockStorageDelete.mockResolvedValue(undefined);
  mockUsersDocUpdate.mockResolvedValue(undefined);

  mockUsersDocRef.mockImplementation(() => ({
    update: mockUsersDocUpdate,
  }));
  mockStorageFile.mockImplementation(() => ({
    delete: mockStorageDelete,
  }));
  mockStorageBucket.mockImplementation(() => ({
    file: mockStorageFile,
  }));
});

describe('DELETE /users/me/profile-picture', () => {
  it('returns 401 when unauthenticated', async () => {
    const res = await request(buildApp())
      .delete('/users/me/profile-picture');

    expect(res.status).toBe(401);
  });

  it('returns 204 and deletes storage file and Firestore field', async () => {
    const res = await request(buildApp())
      .delete('/users/me/profile-picture')
      .set('Authorization', VALID_TOKEN);

    expect(res.status).toBe(204);
    expect(res.body).toEqual({});

    // Verify storage delete was called with correct path
    expect(mockStorageFile).toHaveBeenCalledWith(`profile-pictures/${TEST_UID}/avatar.webp`);
    expect(mockStorageDelete).toHaveBeenCalledOnce();

    // Verify Firestore field was deleted
    expect(mockUsersDocRef).toHaveBeenCalledWith(TEST_UID);
    expect(mockUsersDocUpdate).toHaveBeenCalledWith({
      profilePictureUrl: '__FIELD_DELETE_SENTINEL__',
    });
    expect(mockFieldValueDelete).toHaveBeenCalled();
  });

  it('returns 204 even if no picture existed in storage (idempotent)', async () => {
    // Simulate storage "not found" error
    mockStorageDelete.mockRejectedValueOnce({ code: 404 });

    const res = await request(buildApp())
      .delete('/users/me/profile-picture')
      .set('Authorization', VALID_TOKEN);

    expect(res.status).toBe(204);

    // Should still update Firestore to clear the field
    expect(mockUsersDocUpdate).toHaveBeenCalledWith({
      profilePictureUrl: '__FIELD_DELETE_SENTINEL__',
    });
  });

  it('propagates non-404 storage errors', async () => {
    mockStorageDelete.mockRejectedValueOnce({ code: 500, message: 'Internal error' });

    const res = await request(buildApp())
      .delete('/users/me/profile-picture')
      .set('Authorization', VALID_TOKEN);

    expect(res.status).toBe(500);

    // Firestore should NOT be updated when storage fails with non-404
    expect(mockUsersDocUpdate).not.toHaveBeenCalled();
  });
});
