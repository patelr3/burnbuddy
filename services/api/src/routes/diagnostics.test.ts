import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import express from 'express';
import request from 'supertest';

const {
  mockVerifyIdToken,
  mockContainerExists,
  mockGetContainerClient,
  mockLoggerError,
} = vi.hoisted(() => {
  const mockVerifyIdToken = vi.fn();
  const mockContainerExists = vi.fn();
  const mockGetContainerClient = vi.fn(() => ({
    exists: mockContainerExists,
  }));
  const mockLoggerError = vi.fn();

  return {
    mockVerifyIdToken,
    mockContainerExists,
    mockGetContainerClient,
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
    AZURE_STORAGE_ACCOUNT_URL: process.env.AZURE_STORAGE_ACCOUNT_URL,
  };

  mockVerifyIdToken.mockResolvedValue({ uid: TEST_UID });
  mockContainerExists.mockResolvedValue(true);
  mockGetContainerClient.mockReturnValue({ exists: mockContainerExists });
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
