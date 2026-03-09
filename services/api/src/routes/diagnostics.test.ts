import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import express from 'express';
import request from 'supertest';

const {
  mockVerifyIdToken,
  mockBucketExists,
  mockGetStorageBucket,
  mockLoggerError,
} = vi.hoisted(() => {
  const mockVerifyIdToken = vi.fn();
  const mockBucketExists = vi.fn();
  const mockGetStorageBucket = vi.fn(() => ({
    exists: mockBucketExists,
  }));
  const mockLoggerError = vi.fn();

  return {
    mockVerifyIdToken,
    mockBucketExists,
    mockGetStorageBucket,
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
  getStorageBucket: mockGetStorageBucket,
}));

vi.mock('../lib/firestore', () => ({
  getDb: vi.fn(),
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
    FIREBASE_SERVICE_ACCOUNT_JSON: process.env.FIREBASE_SERVICE_ACCOUNT_JSON,
    FIREBASE_STORAGE_BUCKET: process.env.FIREBASE_STORAGE_BUCKET,
    FIREBASE_PROJECT_ID: process.env.FIREBASE_PROJECT_ID,
  };

  mockVerifyIdToken.mockResolvedValue({ uid: TEST_UID });
  mockBucketExists.mockResolvedValue([true]);
  mockGetStorageBucket.mockReturnValue({ exists: mockBucketExists });
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
    process.env.FIREBASE_SERVICE_ACCOUNT_JSON = '{"key": "value"}';
    process.env.FIREBASE_STORAGE_BUCKET = 'test-bucket.appspot.com';

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
        bucketName: 'test-bucket.appspot.com',
        bucketExists: true,
        credentialsPresent: true,
      },
    });
  });

  it('reports credentialsPresent as false when env var is missing', async () => {
    delete process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
    process.env.FIREBASE_STORAGE_BUCKET = 'test-bucket.appspot.com';

    const res = await request(buildApp())
      .get('/diagnostics')
      .set('Authorization', VALID_TOKEN);

    expect(res.status).toBe(200);
    expect(res.body.storage.credentialsPresent).toBe(false);
  });

  it('returns partial results with error field when bucket.exists() throws', async () => {
    mockBucketExists.mockRejectedValueOnce(new Error('bucket access denied'));

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
      error: 'Failed to check bucket',
    });
  });

  it('returns storage error when getStorageBucket throws', async () => {
    mockGetStorageBucket.mockImplementationOnce(() => {
      throw new Error('storage not initialized');
    });

    const res = await request(buildApp())
      .get('/diagnostics')
      .set('Authorization', VALID_TOKEN);

    expect(res.status).toBe(200);
    expect(res.body.sharp.version).toBe('0.34.5');
    expect(res.body.storage).toEqual({
      error: 'Failed to check bucket',
    });
  });
});
