import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import express from 'express';
import request from 'supertest';

const {
  mockVerifyIdToken,
  mockUsersDocUpdate,
  mockUsersDocGet,
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
  mockCartoonize,
} = vi.hoisted(() => {
  const mockVerifyIdToken = vi.fn();

  const mockUsersDocUpdate = vi.fn();
  const mockUsersDocGet = vi.fn();
  const mockUsersDocRef = vi.fn(() => ({
    update: mockUsersDocUpdate,
    get: mockUsersDocGet,
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

  const mockCartoonize = vi.fn();

  return {
    mockVerifyIdToken,
    mockUsersDocUpdate,
    mockUsersDocGet,
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
    mockCartoonize,
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

// Mock cartoon service — use a class so constructor survives resetAllMocks()
vi.mock('../services/replicate-cartoon-service', () => ({
  ReplicateCartoonService: class MockReplicateCartoonService {
    cartoonize = mockCartoonize;
  },
  PassthroughCartoonService: class MockPassthroughCartoonService {
    cartoonize = vi.fn().mockResolvedValue(null);
  },
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
const TEST_BLOB_URL = 'https://burnbuddybetasa.blob.core.windows.net/uploads/profile-pictures/test-uid-001/avatar.jpeg';
const TEST_ORIGINAL_BLOB_URL = 'https://burnbuddybetasa.blob.core.windows.net/uploads/profile-pictures/test-uid-001/original.jpeg';

beforeEach(() => {
  vi.resetAllMocks();

  // Ensure cartoon conversion is enabled by default for existing tests
  process.env.REPLICATE_API_TOKEN = 'test-replicate-token';

  mockVerifyIdToken.mockResolvedValue({ uid: TEST_UID });
  mockSharpToBuffer.mockResolvedValue(Buffer.from('optimized-image-data'));
  mockCartoonize.mockResolvedValue(Buffer.from('cartoon-image-data'));
  mockUsersDocGet.mockResolvedValue({ exists: true, data: () => ({}) });
  const sharpChain = {
    rotate: vi.fn().mockReturnThis(),
    resize: vi.fn().mockReturnThis(),
    webp: vi.fn().mockReturnThis(),
    jpeg: vi.fn().mockReturnThis(),
    toBuffer: mockSharpToBuffer,
  };
  mockSharpConstructor.mockReturnValue(sharpChain);
  mockUpload.mockResolvedValue(undefined);
  mockGetBlobUrl.mockImplementation((path: string) => {
    if (path.includes('original.jpeg')) return TEST_ORIGINAL_BLOB_URL;
    return TEST_BLOB_URL;
  });
  mockUsersDocUpdate.mockResolvedValue(undefined);

  mockUsersDocRef.mockImplementation(() => ({
    update: mockUsersDocUpdate,
    get: mockUsersDocGet,
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

  it('returns 200 and profilePictureStatus processing on successful upload', async () => {
    const imageBuffer = Buffer.alloc(100, 0xff);

    const res = await request(buildApp())
      .post('/users/me/profile-picture')
      .set('Authorization', VALID_TOKEN)
      .attach('picture', imageBuffer, { filename: 'photo.jpg', contentType: 'image/jpeg' });

    expect(res.status).toBe(200);
    expect(res.body.profilePictureStatus).toBe('processing');
    expect(res.body).not.toHaveProperty('profilePictureUrl');

    // Verify sharp was called for image processing
    expect(mockSharpConstructor).toHaveBeenCalledOnce();
    expect(mockSharpToBuffer).toHaveBeenCalledOnce();

    // Verify original uploaded
    expect(mockGetBlockBlobClient).toHaveBeenCalledWith(`profile-pictures/${TEST_UID}/original.jpeg`);

    // Verify Firestore processing update
    expect(mockUsersDocUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ profilePictureStatus: 'processing' }),
    );

    // Wait for background task to complete
    await vi.waitFor(() => {
      expect(mockUsersDocUpdate).toHaveBeenCalledTimes(2);
    });

    // Verify cartoon service was called with blob URL of the original
    expect(mockCartoonize).toHaveBeenCalledWith(TEST_ORIGINAL_BLOB_URL);

    // Verify avatar uploaded in background
    expect(mockGetBlockBlobClient).toHaveBeenCalledWith(`profile-pictures/${TEST_UID}/avatar.jpeg`);
    expect(mockUpload).toHaveBeenCalledTimes(2);

    // Verify Firestore ready update
    const readyArg = mockUsersDocUpdate.mock.calls[1][0];
    expect(readyArg.profilePictureUrl).toContain(TEST_BLOB_URL);
    expect(readyArg.profilePictureUrl).toMatch(/\?v=\d+/);
    expect(readyArg.profilePictureStatus).toBe('ready');
  });

  it('accepts PNG uploads', async () => {
    const imageBuffer = Buffer.alloc(100, 0xff);

    const res = await request(buildApp())
      .post('/users/me/profile-picture')
      .set('Authorization', VALID_TOKEN)
      .attach('picture', imageBuffer, { filename: 'photo.png', contentType: 'image/png' });

    expect(res.status).toBe(200);
    expect(res.body.profilePictureStatus).toBe('processing');
  });

  it('accepts WebP uploads', async () => {
    const imageBuffer = Buffer.alloc(100, 0xff);

    const res = await request(buildApp())
      .post('/users/me/profile-picture')
      .set('Authorization', VALID_TOKEN)
      .attach('picture', imageBuffer, { filename: 'photo.webp', contentType: 'image/webp' });

    expect(res.status).toBe(200);
    expect(res.body.profilePictureStatus).toBe('processing');
  });

  it('returns 413 when file exceeds 15 MB', async () => {
    const oversizedBuffer = Buffer.alloc(15 * 1024 * 1024 + 1, 0xff);

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
    expect(res.body.profilePictureStatus).toBe('processing');
  });

  it('accepts HEIF uploads', async () => {
    const imageBuffer = Buffer.alloc(100, 0xff);

    const res = await request(buildApp())
      .post('/users/me/profile-picture')
      .set('Authorization', VALID_TOKEN)
      .attach('picture', imageBuffer, { filename: 'photo.heif', contentType: 'image/heif' });

    expect(res.status).toBe(200);
    expect(res.body.profilePictureStatus).toBe('processing');
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

  it('stores original as backup and cartoon as avatar in background', async () => {
    const originalBuffer = Buffer.alloc(200, 0xab);
    const optimizedBuffer = Buffer.from('converted-optimized-data');
    const cartoonBuffer = Buffer.from('cartoon-converted-data');
    mockSharpToBuffer.mockResolvedValueOnce(optimizedBuffer);
    mockCartoonize.mockResolvedValueOnce(cartoonBuffer);

    const res = await request(buildApp())
      .post('/users/me/profile-picture')
      .set('Authorization', VALID_TOKEN)
      .attach('picture', originalBuffer, { filename: 'photo.jpg', contentType: 'image/jpeg' });

    expect(res.status).toBe(200);
    expect(res.body.profilePictureStatus).toBe('processing');

    // Wait for background task to complete
    await vi.waitFor(() => {
      expect(mockUpload).toHaveBeenCalledTimes(2);
    });

    // Two storage uploads: original.jpeg (optimized buffer) and avatar.jpeg (cartoon buffer)
    expect(mockGetBlockBlobClient).toHaveBeenCalledWith(`profile-pictures/${TEST_UID}/original.jpeg`);
    expect(mockGetBlockBlobClient).toHaveBeenCalledWith(`profile-pictures/${TEST_UID}/avatar.jpeg`);

    // First upload: original backup with optimized buffer
    expect(mockUpload).toHaveBeenNthCalledWith(
      1,
      optimizedBuffer,
      optimizedBuffer.length,
      expect.objectContaining({
        blobHTTPHeaders: expect.objectContaining({
          blobContentType: 'image/jpeg',
          blobCacheControl: 'public, max-age=86400',
        }),
      }),
    );

    // Second upload: avatar with cartoon buffer
    expect(mockUpload).toHaveBeenNthCalledWith(
      2,
      cartoonBuffer,
      cartoonBuffer.length,
      expect.objectContaining({
        blobHTTPHeaders: expect.objectContaining({
          blobContentType: 'image/jpeg',
          blobCacheControl: 'public, max-age=86400',
        }),
      }),
    );
  });

  it('sets profilePictureStatus to failed when cartoon conversion fails in background', async () => {
    mockCartoonize.mockRejectedValueOnce(new Error('Replicate API timeout'));

    const imageBuffer = Buffer.alloc(100, 0xff);
    const res = await request(buildApp())
      .post('/users/me/profile-picture')
      .set('Authorization', VALID_TOKEN)
      .attach('picture', imageBuffer, { filename: 'photo.jpg', contentType: 'image/jpeg' });

    // Returns immediately with processing status
    expect(res.status).toBe(200);
    expect(res.body.profilePictureStatus).toBe('processing');

    // Wait for background task to set 'failed'
    await vi.waitFor(() => {
      expect(mockUsersDocUpdate).toHaveBeenCalledTimes(2);
    });

    // First update: processing, second update: failed
    expect(mockUsersDocUpdate.mock.calls[0][0].profilePictureStatus).toBe('processing');
    expect(mockUsersDocUpdate.mock.calls[1][0]).toEqual({ profilePictureStatus: 'failed' });

    // Original was uploaded (before cartoon conversion)
    expect(mockGetBlockBlobClient).toHaveBeenCalledWith(`profile-pictures/${TEST_UID}/original.jpeg`);

    // Error was logged
    expect(mockLoggerError).toHaveBeenCalledWith(
      expect.objectContaining({ uid: TEST_UID }),
      'Background cartoon conversion failed',
    );
  });

  it('does not update Firestore profilePictureUrl on cartoon conversion failure', async () => {
    mockCartoonize.mockRejectedValueOnce(new Error('model unavailable'));

    const imageBuffer = Buffer.alloc(100, 0xff);
    const res = await request(buildApp())
      .post('/users/me/profile-picture')
      .set('Authorization', VALID_TOKEN)
      .attach('picture', imageBuffer, { filename: 'photo.jpg', contentType: 'image/jpeg' });

    expect(res.status).toBe(200);
    expect(res.body.profilePictureStatus).toBe('processing');

    // Wait for background task to complete
    await vi.waitFor(() => {
      expect(mockUsersDocUpdate).toHaveBeenCalledTimes(2);
    });

    // First update is 'processing', second is 'failed' (no profilePictureUrl)
    expect(mockUsersDocUpdate.mock.calls[0][0].profilePictureStatus).toBe('processing');
    expect(mockUsersDocUpdate.mock.calls[1][0]).toEqual({ profilePictureStatus: 'failed' });
    // No profilePictureUrl was set
    expect(mockUsersDocUpdate.mock.calls[1][0]).not.toHaveProperty('profilePictureUrl');
  });

  it('accepts HEIC file when browser reports application/octet-stream (extension fallback)', async () => {
    const imageBuffer = Buffer.alloc(100, 0xff);

    const res = await request(buildApp())
      .post('/users/me/profile-picture')
      .set('Authorization', VALID_TOKEN)
      .attach('picture', imageBuffer, { filename: 'photo.heic', contentType: 'application/octet-stream' });

    expect(res.status).toBe(200);
    expect(res.body.profilePictureStatus).toBe('processing');

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
    expect(res.body.profilePictureStatus).toBe('processing');
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

  it('returns 409 when cartoon conversion is already processing', async () => {
    mockUsersDocGet.mockResolvedValueOnce({
      exists: true,
      data: () => ({ profilePictureStatus: 'processing' }),
    });

    const imageBuffer = Buffer.alloc(100, 0xff);

    const res = await request(buildApp())
      .post('/users/me/profile-picture')
      .set('Authorization', VALID_TOKEN)
      .attach('picture', imageBuffer, { filename: 'photo.jpg', contentType: 'image/jpeg' });

    expect(res.status).toBe(409);
    expect(res.body.error).toMatch(/already in progress/i);

    // Should not have attempted image processing or upload
    expect(mockSharpConstructor).not.toHaveBeenCalled();
    expect(mockUpload).not.toHaveBeenCalled();
    expect(mockUsersDocUpdate).not.toHaveBeenCalled();
  });

  describe('passthrough when REPLICATE_API_TOKEN is missing', () => {
    let originalToken: string | undefined;

    beforeEach(() => {
      originalToken = process.env.REPLICATE_API_TOKEN;
      delete process.env.REPLICATE_API_TOKEN;
    });

    afterEach(() => {
      if (originalToken !== undefined) {
        process.env.REPLICATE_API_TOKEN = originalToken;
      } else {
        delete process.env.REPLICATE_API_TOKEN;
      }
    });

    it('returns 200 and processing status when token is missing', async () => {
      const optimizedBuffer = Buffer.from('optimized-image-data');
      mockSharpToBuffer.mockResolvedValueOnce(optimizedBuffer);

      const imageBuffer = Buffer.alloc(100, 0xff);
      const res = await request(buildApp())
        .post('/users/me/profile-picture')
        .set('Authorization', VALID_TOKEN)
        .attach('picture', imageBuffer, { filename: 'photo.jpg', contentType: 'image/jpeg' });

      expect(res.status).toBe(200);
      expect(res.body.profilePictureStatus).toBe('processing');
    });

    it('uploads optimizedBuffer as both original.jpeg and avatar.jpeg in background', async () => {
      const optimizedBuffer = Buffer.from('optimized-image-data');
      mockSharpToBuffer.mockResolvedValueOnce(optimizedBuffer);

      const imageBuffer = Buffer.alloc(100, 0xff);
      await request(buildApp())
        .post('/users/me/profile-picture')
        .set('Authorization', VALID_TOKEN)
        .attach('picture', imageBuffer, { filename: 'photo.jpg', contentType: 'image/jpeg' });

      // Wait for background task to complete
      await vi.waitFor(() => {
        expect(mockUpload).toHaveBeenCalledTimes(2);
      });

      // Both original.jpeg and avatar.jpeg are uploaded
      expect(mockGetBlockBlobClient).toHaveBeenCalledWith(`profile-pictures/${TEST_UID}/original.jpeg`);
      expect(mockGetBlockBlobClient).toHaveBeenCalledWith(`profile-pictures/${TEST_UID}/avatar.jpeg`);

      // Both uploads use the same optimizedBuffer
      expect(mockUpload).toHaveBeenNthCalledWith(
        1,
        optimizedBuffer,
        optimizedBuffer.length,
        expect.objectContaining({
          blobHTTPHeaders: expect.objectContaining({ blobContentType: 'image/jpeg' }),
        }),
      );
      expect(mockUpload).toHaveBeenNthCalledWith(
        2,
        optimizedBuffer,
        optimizedBuffer.length,
        expect.objectContaining({
          blobHTTPHeaders: expect.objectContaining({ blobContentType: 'image/jpeg' }),
        }),
      );
    });

    it('logs a warning that cartoon conversion is disabled', async () => {
      const imageBuffer = Buffer.alloc(100, 0xff);
      await request(buildApp())
        .post('/users/me/profile-picture')
        .set('Authorization', VALID_TOKEN)
        .attach('picture', imageBuffer, { filename: 'photo.jpg', contentType: 'image/jpeg' });

      expect(mockLoggerWarn).toHaveBeenCalledWith(
        'REPLICATE_API_TOKEN not set — cartoon conversion disabled, using original image as avatar',
      );
    });

    it('does not call ReplicateCartoonService.cartoonize', async () => {
      const imageBuffer = Buffer.alloc(100, 0xff);
      await request(buildApp())
        .post('/users/me/profile-picture')
        .set('Authorization', VALID_TOKEN)
        .attach('picture', imageBuffer, { filename: 'photo.jpg', contentType: 'image/jpeg' });

      // The mockCartoonize from ReplicateCartoonService should NOT be called
      expect(mockCartoonize).not.toHaveBeenCalled();
    });

    it('updates Firestore with profilePictureUrl in background', async () => {
      const imageBuffer = Buffer.alloc(100, 0xff);
      const res = await request(buildApp())
        .post('/users/me/profile-picture')
        .set('Authorization', VALID_TOKEN)
        .attach('picture', imageBuffer, { filename: 'photo.jpg', contentType: 'image/jpeg' });

      expect(res.status).toBe(200);
      expect(res.body.profilePictureStatus).toBe('processing');

      // Wait for background task to complete
      await vi.waitFor(() => {
        expect(mockUsersDocUpdate).toHaveBeenCalledTimes(2);
      });

      expect(mockUsersDocRef).toHaveBeenCalledWith(TEST_UID);
      // First update: processing
      expect(mockUsersDocUpdate.mock.calls[0][0].profilePictureStatus).toBe('processing');
      // Second update: ready with URL
      const readyArg = mockUsersDocUpdate.mock.calls[1][0];
      expect(readyArg.profilePictureUrl).toContain(TEST_BLOB_URL);
      expect(readyArg.profilePictureStatus).toBe('ready');
    });
  });
});
