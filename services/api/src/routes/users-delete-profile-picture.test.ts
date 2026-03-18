import { describe, it, expect, vi, beforeEach } from 'vitest';
import 'express-async-errors';
import express from 'express';
import type { Request, Response, NextFunction } from 'express';
import request from 'supertest';

const {
  mockVerifyIdToken,
  mockUsersDocUpdate,
  mockUsersDocGet,
  mockUsersDocRef,
  mockDeleteIfExists,
  mockGetBlockBlobClient,
  mockGetContainerClient,
} = vi.hoisted(() => {
  const mockVerifyIdToken = vi.fn();

  const mockUsersDocUpdate = vi.fn();
  const mockUsersDocGet = vi.fn();
  const mockUsersDocRef = vi.fn(() => ({
    update: mockUsersDocUpdate,
    get: mockUsersDocGet,
  }));

  const mockDeleteIfExists = vi.fn();
  const mockGetBlockBlobClient = vi.fn(() => ({
    deleteIfExists: mockDeleteIfExists,
  }));
  const mockGetContainerClient = vi.fn(() => ({
    getBlockBlobClient: mockGetBlockBlobClient,
  }));

  return {
    mockVerifyIdToken,
    mockUsersDocUpdate,
    mockUsersDocGet,
    mockUsersDocRef,
    mockDeleteIfExists,
    mockGetBlockBlobClient,
    mockGetContainerClient,
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
import { FieldValue } from 'firebase-admin/firestore';

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
  mockUsersDocGet.mockResolvedValue({ exists: true, data: () => ({}) });

  mockUsersDocRef.mockImplementation(() => ({
    update: mockUsersDocUpdate,
    get: mockUsersDocGet,
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

    // Verify both blobs deleted: original.jpeg and avatar.jpeg
    expect(mockGetBlockBlobClient).toHaveBeenCalledWith(`profile-pictures/${TEST_UID}/original.jpeg`);
    expect(mockGetBlockBlobClient).toHaveBeenCalledWith(`profile-pictures/${TEST_UID}/avatar.jpeg`);
    expect(mockDeleteIfExists).toHaveBeenCalledTimes(2);

    // Verify Firestore fields were deleted
    expect(mockUsersDocRef).toHaveBeenCalledWith(TEST_UID);
    expect(mockUsersDocUpdate).toHaveBeenCalledWith({
      profilePictureUrl: FieldValue.delete(),
      profilePictureStatus: FieldValue.delete(),
    });
  });

  it('returns 204 even if no picture existed (deleteIfExists is idempotent)', async () => {
    // deleteIfExists resolves successfully even when the blob does not exist
    mockDeleteIfExists.mockResolvedValue(undefined);

    const res = await request(buildApp())
      .delete('/users/me/profile-picture')
      .set('Authorization', VALID_TOKEN);

    expect(res.status).toBe(204);

    // Should still update Firestore to clear the fields
    expect(mockUsersDocUpdate).toHaveBeenCalledWith({
      profilePictureUrl: FieldValue.delete(),
      profilePictureStatus: FieldValue.delete(),
    });
  });

  it('returns 409 when cartoon conversion is already processing', async () => {
    mockUsersDocGet.mockResolvedValueOnce({
      exists: true,
      data: () => ({ profilePictureStatus: 'processing' }),
    });

    const res = await request(buildApp())
      .delete('/users/me/profile-picture')
      .set('Authorization', VALID_TOKEN);

    expect(res.status).toBe(409);
    expect(res.body.error).toMatch(/already in progress/i);

    // Should not have attempted blob deletion or Firestore update
    expect(mockDeleteIfExists).not.toHaveBeenCalled();
    expect(mockUsersDocUpdate).not.toHaveBeenCalled();
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
