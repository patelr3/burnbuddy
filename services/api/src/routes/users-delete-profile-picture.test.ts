import { describe, it, expect, vi, beforeEach } from 'vitest';
import 'express-async-errors';
import express from 'express';
import type { Request, Response, NextFunction } from 'express';
import request from 'supertest';

const {
  mockVerifyIdToken,
  mockUsersDocUpdate,
  mockUsersDocRef,
  mockDeleteIfExists,
  mockGetBlockBlobClient,
  mockGetContainerClient,
  mockFieldValueDelete,
} = vi.hoisted(() => {
  const mockVerifyIdToken = vi.fn();

  const mockUsersDocUpdate = vi.fn();
  const mockUsersDocRef = vi.fn(() => ({
    update: mockUsersDocUpdate,
  }));

  const mockDeleteIfExists = vi.fn();
  const mockGetBlockBlobClient = vi.fn(() => ({
    deleteIfExists: mockDeleteIfExists,
  }));
  const mockGetContainerClient = vi.fn(() => ({
    getBlockBlobClient: mockGetBlockBlobClient,
  }));

  const mockFieldValueDelete = vi.fn(() => '__FIELD_DELETE_SENTINEL__');

  return {
    mockVerifyIdToken,
    mockUsersDocUpdate,
    mockUsersDocRef,
    mockDeleteIfExists,
    mockGetBlockBlobClient,
    mockGetContainerClient,
    mockFieldValueDelete,
  };
});

vi.mock('../lib/firebase', () => ({
  admin: {
    auth: () => ({ verifyIdToken: mockVerifyIdToken }),
    firestore: {
      FieldValue: {
        delete: mockFieldValueDelete,
      },
    },
  },
  initFirebase: vi.fn(),
}));

vi.mock('../lib/storage', () => ({
  getContainerClient: mockGetContainerClient,
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

// Mock cartoon service — prevents real Replicate API calls and missing API token errors
vi.mock('../services/replicate-cartoon-service', () => ({
  ReplicateCartoonService: class MockReplicateCartoonService {
    cartoonize = vi.fn().mockResolvedValue(Buffer.from('cartoon-image-data'));
  },
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
  mockDeleteIfExists.mockResolvedValue(undefined);
  mockUsersDocUpdate.mockResolvedValue(undefined);

  mockUsersDocRef.mockImplementation(() => ({
    update: mockUsersDocUpdate,
  }));
  mockGetBlockBlobClient.mockImplementation(() => ({
    deleteIfExists: mockDeleteIfExists,
  }));
  mockGetContainerClient.mockImplementation(() => ({
    getBlockBlobClient: mockGetBlockBlobClient,
  }));
});

describe('DELETE /users/me/profile-picture', () => {
  it('returns 401 when unauthenticated', async () => {
    const res = await request(buildApp())
      .delete('/users/me/profile-picture');

    expect(res.status).toBe(401);
  });

  it('returns 204 and deletes blob and Firestore field', async () => {
    const res = await request(buildApp())
      .delete('/users/me/profile-picture')
      .set('Authorization', VALID_TOKEN);

    expect(res.status).toBe(204);
    expect(res.body).toEqual({});

    // Verify both blobs deleted: original.webp and avatar.webp
    expect(mockGetBlockBlobClient).toHaveBeenCalledWith(`profile-pictures/${TEST_UID}/original.webp`);
    expect(mockGetBlockBlobClient).toHaveBeenCalledWith(`profile-pictures/${TEST_UID}/avatar.webp`);
    expect(mockDeleteIfExists).toHaveBeenCalledTimes(2);

    // Verify Firestore field was deleted
    expect(mockUsersDocRef).toHaveBeenCalledWith(TEST_UID);
    expect(mockUsersDocUpdate).toHaveBeenCalledWith({
      profilePictureUrl: '__FIELD_DELETE_SENTINEL__',
    });
    expect(mockFieldValueDelete).toHaveBeenCalled();
  });

  it('returns 204 even if no picture existed (deleteIfExists is idempotent)', async () => {
    // deleteIfExists resolves successfully even when the blob does not exist
    mockDeleteIfExists.mockResolvedValue(undefined);

    const res = await request(buildApp())
      .delete('/users/me/profile-picture')
      .set('Authorization', VALID_TOKEN);

    expect(res.status).toBe(204);

    // Should still update Firestore to clear the field
    expect(mockUsersDocUpdate).toHaveBeenCalledWith({
      profilePictureUrl: '__FIELD_DELETE_SENTINEL__',
    });
  });

  it('propagates storage errors', async () => {
    mockDeleteIfExists.mockRejectedValueOnce(new Error('Storage unavailable'));

    const res = await request(buildApp())
      .delete('/users/me/profile-picture')
      .set('Authorization', VALID_TOKEN);

    expect(res.status).toBe(500);

    // Firestore should NOT be updated when storage fails
    expect(mockUsersDocUpdate).not.toHaveBeenCalled();
  });
});
