import { describe, it, expect, vi, beforeEach } from 'vitest';
import express from 'express';
import request from 'supertest';

const {
  mockVerifyIdToken,
  mockUsersDocUpdate,
  mockUsersDocRef,
  mockSharpToBuffer,
  mockSharpConstructor,
  mockStorageSave,
  mockGetSignedUrl,
  mockStorageFile,
  mockStorageBucket,
} = vi.hoisted(() => {
  const mockVerifyIdToken = vi.fn();

  const mockUsersDocUpdate = vi.fn();
  const mockUsersDocRef = vi.fn(() => ({
    update: mockUsersDocUpdate,
  }));

  const mockSharpToBuffer = vi.fn();
  const mockSharpConstructor = vi.fn();

  const mockStorageSave = vi.fn();
  const mockGetSignedUrl = vi.fn();
  const mockStorageFile = vi.fn(() => ({
    save: mockStorageSave,
    getSignedUrl: mockGetSignedUrl,
  }));
  const mockStorageBucket = vi.fn(() => ({
    file: mockStorageFile,
  }));

  return {
    mockVerifyIdToken,
    mockUsersDocUpdate,
    mockUsersDocRef,
    mockSharpToBuffer,
    mockSharpConstructor,
    mockStorageSave,
    mockGetSignedUrl,
    mockStorageFile,
    mockStorageBucket,
  };
});

vi.mock('../lib/firebase', () => ({
  admin: {
    auth: () => ({ verifyIdToken: mockVerifyIdToken }),
  },
  initFirebase: vi.fn(),
}));

vi.mock('../lib/storage', () => ({
  getStorageBucket: mockStorageBucket,
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

// Mock sharp — returns a chainable builder with toBuffer at the end
vi.mock('sharp', () => ({
  default: mockSharpConstructor,
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
  return app;
}

const VALID_TOKEN = 'Bearer valid.token';
const TEST_UID = 'test-uid-001';
const SIGNED_URL = 'https://storage.googleapis.com/signed-url/avatar.webp';

beforeEach(() => {
  vi.resetAllMocks();

  mockVerifyIdToken.mockResolvedValue({ uid: TEST_UID });
  mockSharpToBuffer.mockResolvedValue(Buffer.from('optimized-image-data'));
  const sharpChain = {
    rotate: vi.fn().mockReturnThis(),
    resize: vi.fn().mockReturnThis(),
    webp: vi.fn().mockReturnThis(),
    toBuffer: mockSharpToBuffer,
  };
  mockSharpConstructor.mockReturnValue(sharpChain);
  mockStorageSave.mockResolvedValue(undefined);
  mockGetSignedUrl.mockResolvedValue([SIGNED_URL]);
  mockUsersDocUpdate.mockResolvedValue(undefined);

  mockUsersDocRef.mockImplementation(() => ({
    update: mockUsersDocUpdate,
  }));
  mockStorageFile.mockImplementation(() => ({
    save: mockStorageSave,
    getSignedUrl: mockGetSignedUrl,
  }));
  mockStorageBucket.mockImplementation(() => ({
    file: mockStorageFile,
  }));
});

describe('POST /users/me/profile-picture', () => {
  it('returns 401 when unauthenticated', async () => {
    const res = await request(buildApp())
      .post('/users/me/profile-picture');

    expect(res.status).toBe(401);
  });

  it('returns 200 and profilePictureUrl on successful upload', async () => {
    const imageBuffer = Buffer.alloc(100, 0xff);

    const res = await request(buildApp())
      .post('/users/me/profile-picture')
      .set('Authorization', VALID_TOKEN)
      .attach('picture', imageBuffer, { filename: 'photo.jpg', contentType: 'image/jpeg' });

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ profilePictureUrl: SIGNED_URL });

    // Verify sharp was called for image processing
    expect(mockSharpConstructor).toHaveBeenCalledOnce();
    expect(mockSharpToBuffer).toHaveBeenCalledOnce();

    // Verify storage upload
    expect(mockStorageFile).toHaveBeenCalledWith(`profile-pictures/${TEST_UID}/avatar.webp`);
    expect(mockStorageSave).toHaveBeenCalledWith(
      Buffer.from('optimized-image-data'),
      expect.objectContaining({ contentType: 'image/webp' }),
    );

    // Verify signed URL generation
    expect(mockGetSignedUrl).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'read' }),
    );

    // Verify Firestore update
    expect(mockUsersDocRef).toHaveBeenCalledWith(TEST_UID);
    expect(mockUsersDocUpdate).toHaveBeenCalledWith({ profilePictureUrl: SIGNED_URL });
  });

  it('accepts PNG uploads', async () => {
    const imageBuffer = Buffer.alloc(100, 0xff);

    const res = await request(buildApp())
      .post('/users/me/profile-picture')
      .set('Authorization', VALID_TOKEN)
      .attach('picture', imageBuffer, { filename: 'photo.png', contentType: 'image/png' });

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ profilePictureUrl: SIGNED_URL });
  });

  it('accepts WebP uploads', async () => {
    const imageBuffer = Buffer.alloc(100, 0xff);

    const res = await request(buildApp())
      .post('/users/me/profile-picture')
      .set('Authorization', VALID_TOKEN)
      .attach('picture', imageBuffer, { filename: 'photo.webp', contentType: 'image/webp' });

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ profilePictureUrl: SIGNED_URL });
  });

  it('returns 413 when file exceeds 5 MB', async () => {
    const oversizedBuffer = Buffer.alloc(5 * 1024 * 1024 + 1, 0xff);

    const res = await request(buildApp())
      .post('/users/me/profile-picture')
      .set('Authorization', VALID_TOKEN)
      .attach('picture', oversizedBuffer, { filename: 'big.jpg', contentType: 'image/jpeg' });

    expect(res.status).toBe(413);
    expect(res.body.error).toMatch(/too large/i);

    // Processing and storage should not be called
    expect(mockStorageSave).not.toHaveBeenCalled();
  });

  it('accepts HEIC uploads (iPhone format)', async () => {
    const imageBuffer = Buffer.alloc(100, 0xff);

    const res = await request(buildApp())
      .post('/users/me/profile-picture')
      .set('Authorization', VALID_TOKEN)
      .attach('picture', imageBuffer, { filename: 'photo.heic', contentType: 'image/heic' });

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ profilePictureUrl: SIGNED_URL });
  });

  it('accepts HEIF uploads', async () => {
    const imageBuffer = Buffer.alloc(100, 0xff);

    const res = await request(buildApp())
      .post('/users/me/profile-picture')
      .set('Authorization', VALID_TOKEN)
      .attach('picture', imageBuffer, { filename: 'photo.heif', contentType: 'image/heif' });

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ profilePictureUrl: SIGNED_URL });
  });

  it('returns 400 when content type is not an image', async () => {
    const textBuffer = Buffer.from('not an image');

    const res = await request(buildApp())
      .post('/users/me/profile-picture')
      .set('Authorization', VALID_TOKEN)
      .attach('picture', textBuffer, { filename: 'file.txt', contentType: 'text/plain' });

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/invalid file type/i);

    expect(mockStorageSave).not.toHaveBeenCalled();
  });

  it('returns 400 when no file is uploaded', async () => {
    const res = await request(buildApp())
      .post('/users/me/profile-picture')
      .set('Authorization', VALID_TOKEN);

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/no file/i);
  });

  it('returns 500 when image processing fails', async () => {
    mockSharpToBuffer.mockRejectedValueOnce(new Error('sharp crashed'));

    const imageBuffer = Buffer.alloc(100, 0xff);
    const res = await request(buildApp())
      .post('/users/me/profile-picture')
      .set('Authorization', VALID_TOKEN)
      .attach('picture', imageBuffer, { filename: 'photo.jpg', contentType: 'image/jpeg' });

    expect(res.status).toBe(500);
    expect(res.body.error).toMatch(/processing failed/i);

    expect(mockStorageSave).not.toHaveBeenCalled();
  });

  it('stores only the optimized buffer, not the original', async () => {
    const originalBuffer = Buffer.alloc(200, 0xab);
    const optimizedBuffer = Buffer.from('converted-optimized-data');
    mockSharpToBuffer.mockResolvedValueOnce(optimizedBuffer);

    const res = await request(buildApp())
      .post('/users/me/profile-picture')
      .set('Authorization', VALID_TOKEN)
      .attach('picture', originalBuffer, { filename: 'photo.jpg', contentType: 'image/jpeg' });

    expect(res.status).toBe(200);

    // Only one storage save — with the optimized buffer, not the original
    expect(mockStorageSave).toHaveBeenCalledOnce();
    expect(mockStorageSave).toHaveBeenCalledWith(
      optimizedBuffer,
      expect.objectContaining({ contentType: 'image/webp' }),
    );
  });
});
