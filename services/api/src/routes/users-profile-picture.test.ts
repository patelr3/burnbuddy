import { describe, it, expect, vi, beforeEach } from 'vitest';
import express from 'express';
import request from 'supertest';

const {
  mockVerifyIdToken,
  mockUsersDocUpdate,
  mockUsersDocRef,
  mockSharpToBuffer,
  mockSharpConstructor,
  mockUpload,
  mockGetBlockBlobClient,
  mockGetContainerClient,
  mockGetBlobUrl,
  mockLoggerInfo,
  mockLoggerWarn,
  mockLoggerError,
} = vi.hoisted(() => {
  const mockVerifyIdToken = vi.fn();

  const mockUsersDocUpdate = vi.fn();
  const mockUsersDocRef = vi.fn(() => ({
    update: mockUsersDocUpdate,
  }));

  const mockSharpToBuffer = vi.fn();
  const mockSharpConstructor = vi.fn();

  const mockUpload = vi.fn();
  const mockGetBlockBlobClient = vi.fn(() => ({
    upload: mockUpload,
  }));
  const mockGetContainerClient = vi.fn(() => ({
    getBlockBlobClient: mockGetBlockBlobClient,
  }));
  const mockGetBlobUrl = vi.fn();

  const mockLoggerInfo = vi.fn();
  const mockLoggerWarn = vi.fn();
  const mockLoggerError = vi.fn();

  return {
    mockVerifyIdToken,
    mockUsersDocUpdate,
    mockUsersDocRef,
    mockSharpToBuffer,
    mockSharpConstructor,
    mockUpload,
    mockGetBlockBlobClient,
    mockGetContainerClient,
    mockGetBlobUrl,
    mockLoggerInfo,
    mockLoggerWarn,
    mockLoggerError,
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
  getBlobUrl: mockGetBlobUrl,
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

vi.mock('../lib/logger', () => ({
  logger: {
    info: mockLoggerInfo,
    warn: mockLoggerWarn,
    error: mockLoggerError,
    debug: vi.fn(),
    child: vi.fn(() => ({
      info: mockLoggerInfo,
      warn: mockLoggerWarn,
      error: mockLoggerError,
      debug: vi.fn(),
    })),
  },
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
const TEST_BLOB_URL = 'https://burnbuddybetasa.blob.core.windows.net/uploads/profile-pictures/test-uid-001/avatar.webp';

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
  mockUpload.mockResolvedValue(undefined);
  mockGetBlobUrl.mockReturnValue(TEST_BLOB_URL);
  mockUsersDocUpdate.mockResolvedValue(undefined);

  mockUsersDocRef.mockImplementation(() => ({
    update: mockUsersDocUpdate,
  }));
  mockGetBlockBlobClient.mockImplementation(() => ({
    upload: mockUpload,
  }));
  mockGetContainerClient.mockImplementation(() => ({
    getBlockBlobClient: mockGetBlockBlobClient,
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
    expect(res.body.profilePictureUrl).toContain(TEST_BLOB_URL);
    expect(res.body.profilePictureUrl).toMatch(/\?v=\d+/);

    // Verify sharp was called for image processing
    expect(mockSharpConstructor).toHaveBeenCalledOnce();
    expect(mockSharpToBuffer).toHaveBeenCalledOnce();

    // Verify Azure Blob Storage upload
    expect(mockGetBlockBlobClient).toHaveBeenCalledWith(`profile-pictures/${TEST_UID}/avatar.webp`);
    expect(mockUpload).toHaveBeenCalledWith(
      Buffer.from('optimized-image-data'),
      Buffer.from('optimized-image-data').length,
      expect.objectContaining({
        blobHTTPHeaders: expect.objectContaining({
          blobContentType: 'image/webp',
          blobCacheControl: 'public, max-age=86400',
        }),
      }),
    );

    // Verify getBlobUrl was called
    expect(mockGetBlobUrl).toHaveBeenCalledWith(`profile-pictures/${TEST_UID}/avatar.webp`);

    // Verify Firestore update includes cache-busting param
    expect(mockUsersDocRef).toHaveBeenCalledWith(TEST_UID);
    const updateArg = mockUsersDocUpdate.mock.calls[0][0];
    expect(updateArg.profilePictureUrl).toContain(TEST_BLOB_URL);
    expect(updateArg.profilePictureUrl).toMatch(/\?v=\d+/);
  });

  it('accepts PNG uploads', async () => {
    const imageBuffer = Buffer.alloc(100, 0xff);

    const res = await request(buildApp())
      .post('/users/me/profile-picture')
      .set('Authorization', VALID_TOKEN)
      .attach('picture', imageBuffer, { filename: 'photo.png', contentType: 'image/png' });

    expect(res.status).toBe(200);
    expect(res.body.profilePictureUrl).toContain(TEST_BLOB_URL);
    expect(res.body.profilePictureUrl).toMatch(/\?v=\d+/);
  });

  it('accepts WebP uploads', async () => {
    const imageBuffer = Buffer.alloc(100, 0xff);

    const res = await request(buildApp())
      .post('/users/me/profile-picture')
      .set('Authorization', VALID_TOKEN)
      .attach('picture', imageBuffer, { filename: 'photo.webp', contentType: 'image/webp' });

    expect(res.status).toBe(200);
    expect(res.body.profilePictureUrl).toContain(TEST_BLOB_URL);
    expect(res.body.profilePictureUrl).toMatch(/\?v=\d+/);
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
    expect(mockUpload).not.toHaveBeenCalled();
  });

  it('accepts HEIC uploads (iPhone format)', async () => {
    const imageBuffer = Buffer.alloc(100, 0xff);

    const res = await request(buildApp())
      .post('/users/me/profile-picture')
      .set('Authorization', VALID_TOKEN)
      .attach('picture', imageBuffer, { filename: 'photo.heic', contentType: 'image/heic' });

    expect(res.status).toBe(200);
    expect(res.body.profilePictureUrl).toContain(TEST_BLOB_URL);
    expect(res.body.profilePictureUrl).toMatch(/\?v=\d+/);
  });

  it('accepts HEIF uploads', async () => {
    const imageBuffer = Buffer.alloc(100, 0xff);

    const res = await request(buildApp())
      .post('/users/me/profile-picture')
      .set('Authorization', VALID_TOKEN)
      .attach('picture', imageBuffer, { filename: 'photo.heif', contentType: 'image/heif' });

    expect(res.status).toBe(200);
    expect(res.body.profilePictureUrl).toContain(TEST_BLOB_URL);
    expect(res.body.profilePictureUrl).toMatch(/\?v=\d+/);
  });

  it('returns 400 when content type is not an image', async () => {
    const textBuffer = Buffer.from('not an image');

    const res = await request(buildApp())
      .post('/users/me/profile-picture')
      .set('Authorization', VALID_TOKEN)
      .attach('picture', textBuffer, { filename: 'file.txt', contentType: 'text/plain' });

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/invalid file type/i);

    expect(mockUpload).not.toHaveBeenCalled();
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

    expect(mockUpload).not.toHaveBeenCalled();
  });

  it('returns 503 when storage upload fails', async () => {
    mockUpload.mockRejectedValueOnce(new Error('Azure Blob Storage unavailable'));

    const imageBuffer = Buffer.alloc(100, 0xff);
    const res = await request(buildApp())
      .post('/users/me/profile-picture')
      .set('Authorization', VALID_TOKEN)
      .attach('picture', imageBuffer, { filename: 'photo.jpg', contentType: 'image/jpeg' });

    expect(res.status).toBe(503);
    expect(res.body.error).toMatch(/storage service unavailable/i);
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

    // Only one storage upload — with the optimized buffer, not the original
    expect(mockUpload).toHaveBeenCalledOnce();
    expect(mockUpload).toHaveBeenCalledWith(
      optimizedBuffer,
      optimizedBuffer.length,
      expect.objectContaining({
        blobHTTPHeaders: expect.objectContaining({
          blobContentType: 'image/webp',
          blobCacheControl: 'public, max-age=86400',
        }),
      }),
    );
  });

  it('accepts HEIC file when browser reports application/octet-stream (extension fallback)', async () => {
    const imageBuffer = Buffer.alloc(100, 0xff);

    const res = await request(buildApp())
      .post('/users/me/profile-picture')
      .set('Authorization', VALID_TOKEN)
      .attach('picture', imageBuffer, { filename: 'photo.heic', contentType: 'application/octet-stream' });

    expect(res.status).toBe(200);
    expect(res.body.profilePictureUrl).toContain(TEST_BLOB_URL);
    expect(res.body.profilePictureUrl).toMatch(/\?v=\d+/);

    // Should log that MIME type was inferred from extension
    expect(mockLoggerInfo).toHaveBeenCalledWith(
      expect.objectContaining({ originalMimetype: 'application/octet-stream', resolvedMimetype: 'image/heic' }),
      'MIME type inferred from file extension',
    );
  });

  it('accepts HEIF file when browser reports empty MIME type (extension fallback)', async () => {
    const imageBuffer = Buffer.alloc(100, 0xff);

    const res = await request(buildApp())
      .post('/users/me/profile-picture')
      .set('Authorization', VALID_TOKEN)
      .attach('picture', imageBuffer, { filename: 'photo.heif', contentType: '' });

    expect(res.status).toBe(200);
    expect(res.body.profilePictureUrl).toContain(TEST_BLOB_URL);
    expect(res.body.profilePictureUrl).toMatch(/\?v=\d+/);
  });

  it('rejects file with unknown extension and unknown MIME type', async () => {
    const imageBuffer = Buffer.alloc(100, 0xff);

    const res = await request(buildApp())
      .post('/users/me/profile-picture')
      .set('Authorization', VALID_TOKEN)
      .attach('picture', imageBuffer, { filename: 'file.bmp', contentType: 'application/octet-stream' });

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/invalid file type/i);

    // Should log a warning for the rejected upload
    expect(mockLoggerWarn).toHaveBeenCalledWith(
      expect.objectContaining({ mimetype: 'application/octet-stream', originalname: 'file.bmp' }),
      'Profile picture rejected: unsupported file type',
    );
  });
});
