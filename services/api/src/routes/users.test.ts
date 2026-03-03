import { describe, it, expect, vi, beforeEach } from 'vitest';
import express from 'express';
import request from 'supertest';

// vi.hoisted ensures mock variables are created before the mock factory runs
const { mockVerifyIdToken, mockGet, mockSet, mockUpdate, mockDocRef } = vi.hoisted(() => {
  const mockGet = vi.fn();
  const mockSet = vi.fn();
  const mockUpdate = vi.fn();
  // mockDocRef is re-setup each beforeEach via resetAllMocks + mockReturnValue
  const mockDocRef = vi.fn();
  return { mockVerifyIdToken: vi.fn(), mockGet, mockSet, mockUpdate, mockDocRef };
});

// Mock firebase-admin (used by requireAuth middleware)
vi.mock('../lib/firebase', () => ({
  admin: {
    auth: () => ({ verifyIdToken: mockVerifyIdToken }),
  },
  initFirebase: vi.fn(),
}));

// Mock Firestore — getDb() returns a stub with collection → doc chain
vi.mock('../lib/firestore', () => ({
  getDb: () => ({
    collection: () => ({ doc: mockDocRef }),
  }),
}));

import usersRouter from './users';

function buildApp() {
  const app = express();
  app.use(express.json());
  app.use('/users', usersRouter);
  return app;
}

const VALID_TOKEN = 'Bearer valid.token';
const TEST_UID = 'user-abc-123';
const TEST_PROFILE = {
  uid: TEST_UID,
  email: 'test@example.com',
  displayName: 'Test User',
  createdAt: '2026-01-01T00:00:00.000Z',
};

beforeEach(() => {
  // resetAllMocks clears calls AND queued values (mockResolvedValueOnce etc.)
  vi.resetAllMocks();
  // Re-setup defaults after reset
  mockVerifyIdToken.mockResolvedValue({ uid: TEST_UID });
  mockDocRef.mockReturnValue({ get: mockGet, set: mockSet, update: mockUpdate });
});

// ── POST /users ────────────────────────────────────────────────────────────────

describe('POST /users', () => {
  it('returns 401 when unauthenticated', async () => {
    const res = await request(buildApp()).post('/users');
    expect(res.status).toBe(401);
  });

  it('returns 400 when email is missing', async () => {
    const res = await request(buildApp())
      .post('/users')
      .set('Authorization', VALID_TOKEN)
      .send({ displayName: 'Test User' });
    expect(res.status).toBe(400);
    expect(res.body).toMatchObject({ error: expect.stringContaining('email') });
  });

  it('returns 400 when displayName is missing', async () => {
    const res = await request(buildApp())
      .post('/users')
      .set('Authorization', VALID_TOKEN)
      .send({ email: 'test@example.com' });
    expect(res.status).toBe(400);
    expect(res.body).toMatchObject({ error: expect.stringContaining('displayName') });
  });

  it('returns 409 when profile already exists', async () => {
    mockGet.mockResolvedValueOnce({ exists: true });

    const res = await request(buildApp())
      .post('/users')
      .set('Authorization', VALID_TOKEN)
      .send({ email: 'test@example.com', displayName: 'Test User' });

    expect(res.status).toBe(409);
    expect(res.body).toMatchObject({ error: expect.stringContaining('already exists') });
  });

  it('creates and returns the user profile with 201', async () => {
    mockGet.mockResolvedValueOnce({ exists: false });
    mockSet.mockResolvedValueOnce(undefined);

    const res = await request(buildApp())
      .post('/users')
      .set('Authorization', VALID_TOKEN)
      .send({ email: 'test@example.com', displayName: 'Test User' });

    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({
      uid: TEST_UID,
      email: 'test@example.com',
      displayName: 'Test User',
    });
    expect(res.body.createdAt).toBeDefined();
    expect(mockSet).toHaveBeenCalledOnce();
  });

  it('includes fcmToken in the created profile when provided', async () => {
    mockGet.mockResolvedValueOnce({ exists: false });
    mockSet.mockResolvedValueOnce(undefined);

    const res = await request(buildApp())
      .post('/users')
      .set('Authorization', VALID_TOKEN)
      .send({ email: 'test@example.com', displayName: 'Test User', fcmToken: 'tkn123' });

    expect(res.status).toBe(201);
    expect(res.body.fcmToken).toBe('tkn123');
  });
});

// ── GET /users/me ──────────────────────────────────────────────────────────────

describe('GET /users/me', () => {
  it('returns 401 when unauthenticated', async () => {
    const res = await request(buildApp()).get('/users/me');
    expect(res.status).toBe(401);
  });

  it('returns 404 when profile does not exist', async () => {
    mockGet.mockResolvedValueOnce({ exists: false });

    const res = await request(buildApp())
      .get('/users/me')
      .set('Authorization', VALID_TOKEN);

    expect(res.status).toBe(404);
    expect(res.body).toMatchObject({ error: expect.stringContaining('not found') });
  });

  it('returns the user profile when it exists', async () => {
    mockGet.mockResolvedValueOnce({ exists: true, data: () => TEST_PROFILE });

    const res = await request(buildApp())
      .get('/users/me')
      .set('Authorization', VALID_TOKEN);

    expect(res.status).toBe(200);
    expect(res.body).toEqual(TEST_PROFILE);
  });
});

// ── PUT /users/me ──────────────────────────────────────────────────────────────

describe('PUT /users/me', () => {
  it('returns 401 when unauthenticated', async () => {
    const res = await request(buildApp()).put('/users/me');
    expect(res.status).toBe(401);
  });

  it('updates and returns the profile when it exists', async () => {
    const updatedProfile = { ...TEST_PROFILE, displayName: 'Updated Name' };
    // 1st get (exists check), 2nd get (fresh data after update)
    mockGet
      .mockResolvedValueOnce({ exists: true })
      .mockResolvedValueOnce({ exists: true, data: () => updatedProfile });
    mockUpdate.mockResolvedValueOnce(undefined);

    const res = await request(buildApp())
      .put('/users/me')
      .set('Authorization', VALID_TOKEN)
      .send({ displayName: 'Updated Name' });

    expect(res.status).toBe(200);
    expect(res.body.displayName).toBe('Updated Name');
    expect(mockUpdate).toHaveBeenCalledOnce();
  });

  it('creates a profile with 201 when it does not exist and required fields are provided', async () => {
    mockGet.mockResolvedValueOnce({ exists: false });
    mockSet.mockResolvedValueOnce(undefined);

    const res = await request(buildApp())
      .put('/users/me')
      .set('Authorization', VALID_TOKEN)
      .send({ email: 'new@example.com', displayName: 'New User' });

    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({ email: 'new@example.com', displayName: 'New User' });
    expect(mockSet).toHaveBeenCalledOnce();
  });

  it('returns 400 when profile does not exist and required fields are missing', async () => {
    mockGet.mockResolvedValueOnce({ exists: false });

    const res = await request(buildApp())
      .put('/users/me')
      .set('Authorization', VALID_TOKEN)
      .send({ fcmToken: 'tkn' });

    expect(res.status).toBe(400);
    expect(res.body).toMatchObject({ error: expect.stringContaining('email') });
  });

  it('updates gettingStartedDismissed when profile exists', async () => {
    const updatedProfile = { ...TEST_PROFILE, gettingStartedDismissed: true };
    mockGet
      .mockResolvedValueOnce({ exists: true })
      .mockResolvedValueOnce({ exists: true, data: () => updatedProfile });
    mockUpdate.mockResolvedValueOnce(undefined);

    const res = await request(buildApp())
      .put('/users/me')
      .set('Authorization', VALID_TOKEN)
      .send({ gettingStartedDismissed: true });

    expect(res.status).toBe(200);
    expect(res.body.gettingStartedDismissed).toBe(true);
    expect(mockUpdate).toHaveBeenCalledWith({ gettingStartedDismissed: true });
  });
});

// ── GET /users/:uid ────────────────────────────────────────────────────────────

describe('GET /users/:uid', () => {
  it('returns 401 when unauthenticated', async () => {
    const res = await request(buildApp()).get('/users/some-uid');
    expect(res.status).toBe(401);
  });

  it('returns 404 when user does not exist', async () => {
    mockGet.mockResolvedValueOnce({ exists: false });

    const res = await request(buildApp())
      .get('/users/nonexistent-uid')
      .set('Authorization', VALID_TOKEN);

    expect(res.status).toBe(404);
    expect(res.body).toMatchObject({ error: expect.stringContaining('not found') });
  });

  it('returns uid, displayName, and email when user exists', async () => {
    mockGet.mockResolvedValueOnce({ exists: true, data: () => TEST_PROFILE });

    const res = await request(buildApp())
      .get(`/users/${TEST_UID}`)
      .set('Authorization', VALID_TOKEN);

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ uid: TEST_UID, displayName: 'Test User', email: 'test@example.com' });
  });
});
