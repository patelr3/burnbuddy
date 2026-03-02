import { describe, it, expect, vi, beforeEach } from 'vitest';
import express, { type Request, type Response } from 'express';
import request from 'supertest';

// vi.hoisted ensures this variable is created before the mock factory runs
const { mockVerifyIdToken } = vi.hoisted(() => ({
  mockVerifyIdToken: vi.fn(),
}));

// Mock firebase-admin before importing auth middleware
vi.mock('../lib/firebase', () => ({
  admin: {
    auth: () => ({ verifyIdToken: mockVerifyIdToken }),
  },
  initFirebase: vi.fn(),
}));

import { requireAuth } from './auth';

function buildApp() {
  const app = express();
  app.use(express.json());

  // Protected test route — returns the attached uid
  app.get('/protected', requireAuth, (req: Request, res: Response) => {
    res.json({ uid: req.user?.uid });
  });

  return app;
}

describe('requireAuth middleware', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns 401 when Authorization header is missing', async () => {
    const app = buildApp();
    const res = await request(app).get('/protected');
    expect(res.status).toBe(401);
    expect(res.body).toMatchObject({ error: expect.stringContaining('Missing') });
  });

  it('returns 401 when Authorization header does not start with Bearer', async () => {
    const app = buildApp();
    const res = await request(app)
      .get('/protected')
      .set('Authorization', 'Basic sometoken');
    expect(res.status).toBe(401);
    expect(res.body).toMatchObject({ error: expect.stringContaining('Missing') });
  });

  it('returns 401 when token is invalid', async () => {
    mockVerifyIdToken.mockRejectedValueOnce(new Error('Firebase: invalid token'));
    const app = buildApp();
    const res = await request(app)
      .get('/protected')
      .set('Authorization', 'Bearer invalid.token.here');
    expect(res.status).toBe(401);
    expect(res.body).toMatchObject({ error: expect.stringContaining('Invalid') });
  });

  it('attaches uid to req.user and calls next on valid token', async () => {
    mockVerifyIdToken.mockResolvedValueOnce({ uid: 'test-user-123' });
    const app = buildApp();
    const res = await request(app)
      .get('/protected')
      .set('Authorization', 'Bearer valid.token.here');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ uid: 'test-user-123' });
  });
});
