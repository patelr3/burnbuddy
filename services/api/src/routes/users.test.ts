import { describe, it, expect, vi, beforeEach } from 'vitest';
import express from 'express';
import request from 'supertest';

// vi.hoisted ensures mock variables are created before the mock factory runs
const { mockVerifyIdToken, mockGet, mockSet, mockUpdate, mockDocRef, mockWhere, mockLimit, mockCollectionGet, mockBatchSet, mockBatchCommit, mockBatchDelete, mockBatch, mockGenerateUniqueUsername, mockValidateUsername } = vi.hoisted(() => {
  const mockGet = vi.fn();
  const mockSet = vi.fn();
  const mockUpdate = vi.fn();
  const mockCollectionGet = vi.fn();
  const mockLimit = vi.fn();
  const mockWhere = vi.fn();
  // mockDocRef is re-setup each beforeEach via resetAllMocks + mockReturnValue
  const mockDocRef = vi.fn();
  const mockBatchSet = vi.fn();
  const mockBatchCommit = vi.fn();
  const mockBatchDelete = vi.fn();
  const mockBatch = vi.fn();
  const mockGenerateUniqueUsername = vi.fn();
  const mockValidateUsername = vi.fn();
  return { mockVerifyIdToken: vi.fn(), mockGet, mockSet, mockUpdate, mockDocRef, mockWhere, mockLimit, mockCollectionGet, mockBatchSet, mockBatchCommit, mockBatchDelete, mockBatch, mockGenerateUniqueUsername, mockValidateUsername };
});

// Mock firebase-admin (used by requireAuth middleware)
vi.mock('../lib/firebase', () => ({
  admin: {
    auth: () => ({ verifyIdToken: mockVerifyIdToken }),
  },
  initFirebase: vi.fn(),
}));

// Mock Firestore — getDb() returns a stub with collection → doc chain, collection → where chain, and batch()
vi.mock('../lib/firestore', () => ({
  getDb: () => ({
    collection: () => ({ doc: mockDocRef, where: mockWhere }),
    batch: mockBatch,
  }),
}));

// Mock username generation and validation helpers
vi.mock('../lib/username', () => ({
  generateUniqueUsername: mockGenerateUniqueUsername,
  validateUsername: mockValidateUsername,
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
  // where → where/limit → get chain for collection queries
  mockWhere.mockReturnValue({ where: mockWhere, limit: mockLimit, get: mockCollectionGet });
  mockLimit.mockReturnValue({ get: mockCollectionGet });
  // Batch write defaults
  mockBatch.mockReturnValue({ set: mockBatchSet, delete: mockBatchDelete, commit: mockBatchCommit });
  mockBatchCommit.mockResolvedValue(undefined);
  // Username generation default
  mockGenerateUniqueUsername.mockResolvedValue({ username: 'test', usernameLower: 'test' });
  // Username validation default (null = valid)
  mockValidateUsername.mockReturnValue(null);
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

  it('creates and returns the user profile with 201 including generated username', async () => {
    mockGet.mockResolvedValueOnce({ exists: false });
    mockGenerateUniqueUsername.mockResolvedValueOnce({ username: 'test', usernameLower: 'test' });

    const res = await request(buildApp())
      .post('/users')
      .set('Authorization', VALID_TOKEN)
      .send({ email: 'test@example.com', displayName: 'Test User' });

    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({
      uid: TEST_UID,
      email: 'test@example.com',
      displayName: 'Test User',
      username: 'test',
      usernameLower: 'test',
    });
    expect(res.body.createdAt).toBeDefined();
    expect(mockBatchSet).toHaveBeenCalledTimes(2);
    expect(mockBatchCommit).toHaveBeenCalledOnce();
  });

  it('includes fcmToken in the created profile when provided', async () => {
    mockGet.mockResolvedValueOnce({ exists: false });
    mockGenerateUniqueUsername.mockResolvedValueOnce({ username: 'test', usernameLower: 'test' });

    const res = await request(buildApp())
      .post('/users')
      .set('Authorization', VALID_TOKEN)
      .send({ email: 'test@example.com', displayName: 'Test User', fcmToken: 'tkn123' });

    expect(res.status).toBe(201);
    expect(res.body.fcmToken).toBe('tkn123');
  });

  it('creates a username reservation document in the usernames collection', async () => {
    mockGet.mockResolvedValueOnce({ exists: false });
    mockGenerateUniqueUsername.mockResolvedValueOnce({ username: 'alice', usernameLower: 'alice' });

    const res = await request(buildApp())
      .post('/users')
      .set('Authorization', VALID_TOKEN)
      .send({ email: 'alice@example.com', displayName: 'Alice' });

    expect(res.status).toBe(201);
    // First batch.set is the user profile, second is the username reservation
    expect(mockBatchSet).toHaveBeenCalledTimes(2);
    // Verify username reservation: batch.set(usernameDocRef, { uid })
    const secondCallArgs = mockBatchSet.mock.calls[1];
    expect(secondCallArgs[1]).toEqual({ uid: TEST_UID });
    expect(mockBatchCommit).toHaveBeenCalledOnce();
  });

  it('calls generateUniqueUsername with the email', async () => {
    mockGet.mockResolvedValueOnce({ exists: false });

    await request(buildApp())
      .post('/users')
      .set('Authorization', VALID_TOKEN)
      .send({ email: 'bob@test.com', displayName: 'Bob' });

    expect(mockGenerateUniqueUsername).toHaveBeenCalledWith('bob@test.com', expect.anything());
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

  it('updates and returns the profile when it exists (with username already set)', async () => {
    const existingProfile = { ...TEST_PROFILE, username: 'test', usernameLower: 'test' };
    const updatedProfile = { ...existingProfile, displayName: 'Updated Name' };
    // 1st get (exists check), 2nd get (fresh data after update)
    mockGet
      .mockResolvedValueOnce({ exists: true, data: () => existingProfile })
      .mockResolvedValueOnce({ exists: true, data: () => updatedProfile });
    mockUpdate.mockResolvedValueOnce(undefined);

    const res = await request(buildApp())
      .put('/users/me')
      .set('Authorization', VALID_TOKEN)
      .send({ displayName: 'Updated Name' });

    expect(res.status).toBe(200);
    expect(res.body.displayName).toBe('Updated Name');
    expect(mockUpdate).toHaveBeenCalledOnce();
    // Should NOT generate a username since it already has one
    expect(mockGenerateUniqueUsername).not.toHaveBeenCalled();
  });

  it('creates a profile with 201 and generated username when it does not exist', async () => {
    mockGet.mockResolvedValueOnce({ exists: false });
    mockGenerateUniqueUsername.mockResolvedValueOnce({ username: 'newuser', usernameLower: 'newuser' });

    const res = await request(buildApp())
      .put('/users/me')
      .set('Authorization', VALID_TOKEN)
      .send({ email: 'newuser@example.com', displayName: 'New User' });

    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({
      email: 'newuser@example.com',
      displayName: 'New User',
      username: 'newuser',
      usernameLower: 'newuser',
    });
    expect(mockBatchSet).toHaveBeenCalledTimes(2);
    expect(mockBatchCommit).toHaveBeenCalledOnce();
    expect(mockGenerateUniqueUsername).toHaveBeenCalledWith('newuser@example.com', expect.anything());
  });

  it('creates username reservation atomically on create path', async () => {
    mockGet.mockResolvedValueOnce({ exists: false });
    mockGenerateUniqueUsername.mockResolvedValueOnce({ username: 'alice', usernameLower: 'alice' });

    const res = await request(buildApp())
      .put('/users/me')
      .set('Authorization', VALID_TOKEN)
      .send({ email: 'alice@example.com', displayName: 'Alice' });

    expect(res.status).toBe(201);
    // Second batch.set is the username reservation
    const secondCallArgs = mockBatchSet.mock.calls[1];
    expect(secondCallArgs[1]).toEqual({ uid: TEST_UID });
    expect(mockBatchCommit).toHaveBeenCalledOnce();
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

  it('updates gettingStartedDismissed when profile exists (with username)', async () => {
    const existingProfile = { ...TEST_PROFILE, username: 'test', usernameLower: 'test' };
    const updatedProfile = { ...existingProfile, gettingStartedDismissed: true };
    mockGet
      .mockResolvedValueOnce({ exists: true, data: () => existingProfile })
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

  // Lazy migration tests
  it('auto-generates username for existing user without one (lazy migration)', async () => {
    // Existing profile without username
    const existingProfile = { ...TEST_PROFILE };
    const migratedProfile = { ...TEST_PROFILE, username: 'test', usernameLower: 'test', displayName: 'Updated' };
    mockGet
      .mockResolvedValueOnce({ exists: true, data: () => existingProfile })
      .mockResolvedValueOnce({ exists: true, data: () => migratedProfile });
    mockGenerateUniqueUsername.mockResolvedValueOnce({ username: 'test', usernameLower: 'test' });

    const res = await request(buildApp())
      .put('/users/me')
      .set('Authorization', VALID_TOKEN)
      .send({ displayName: 'Updated' });

    expect(res.status).toBe(200);
    expect(res.body.username).toBe('test');
    expect(res.body.usernameLower).toBe('test');
    expect(mockGenerateUniqueUsername).toHaveBeenCalledWith('test@example.com', expect.anything());
    // Should use batch write for atomic username reservation
    expect(mockBatchSet).toHaveBeenCalledTimes(2);
    expect(mockBatchCommit).toHaveBeenCalledOnce();
  });

  it('lazy migration uses provided email over existing email', async () => {
    const existingProfile = { ...TEST_PROFILE };
    const migratedProfile = { ...TEST_PROFILE, email: 'new@example.com', username: 'new', usernameLower: 'new' };
    mockGet
      .mockResolvedValueOnce({ exists: true, data: () => existingProfile })
      .mockResolvedValueOnce({ exists: true, data: () => migratedProfile });
    mockGenerateUniqueUsername.mockResolvedValueOnce({ username: 'new', usernameLower: 'new' });

    const res = await request(buildApp())
      .put('/users/me')
      .set('Authorization', VALID_TOKEN)
      .send({ email: 'new@example.com' });

    expect(res.status).toBe(200);
    expect(mockGenerateUniqueUsername).toHaveBeenCalledWith('new@example.com', expect.anything());
  });

  it('lazy migration creates username reservation atomically', async () => {
    const existingProfile = { ...TEST_PROFILE };
    const migratedProfile = { ...TEST_PROFILE, username: 'test', usernameLower: 'test' };
    mockGet
      .mockResolvedValueOnce({ exists: true, data: () => existingProfile })
      .mockResolvedValueOnce({ exists: true, data: () => migratedProfile });
    mockGenerateUniqueUsername.mockResolvedValueOnce({ username: 'test', usernameLower: 'test' });

    await request(buildApp())
      .put('/users/me')
      .set('Authorization', VALID_TOKEN)
      .send({ displayName: 'Updated' });

    // Verify batch write: first set is profile update (merge), second is username reservation
    expect(mockBatchSet).toHaveBeenCalledTimes(2);
    const reservationArgs = mockBatchSet.mock.calls[1];
    expect(reservationArgs[1]).toEqual({ uid: TEST_UID });
    expect(mockBatchCommit).toHaveBeenCalledOnce();
    // Should NOT use docRef.update — uses batch.set with merge instead
    expect(mockUpdate).not.toHaveBeenCalled();
  });

  // Username update tests (US-005)
  it('updates username when valid and available', async () => {
    const existingProfile = { ...TEST_PROFILE, username: 'oldname', usernameLower: 'oldname' };
    const updatedProfile = { ...existingProfile, username: 'NewName', usernameLower: 'newname' };
    mockGet
      .mockResolvedValueOnce({ exists: true, data: () => existingProfile })  // exists check
      .mockResolvedValueOnce({ exists: false })                              // username availability check
      .mockResolvedValueOnce({ exists: true, data: () => updatedProfile });  // fresh data after update

    const res = await request(buildApp())
      .put('/users/me')
      .set('Authorization', VALID_TOKEN)
      .send({ username: 'NewName' });

    expect(res.status).toBe(200);
    expect(res.body.username).toBe('NewName');
    expect(res.body.usernameLower).toBe('newname');
    expect(mockValidateUsername).toHaveBeenCalledWith('NewName');
    expect(mockBatchSet).toHaveBeenCalledTimes(2);
    expect(mockBatchDelete).toHaveBeenCalledTimes(1);
    expect(mockBatchCommit).toHaveBeenCalledOnce();
  });

  it('returns 400 when username fails validation', async () => {
    const existingProfile = { ...TEST_PROFILE, username: 'test', usernameLower: 'test' };
    mockGet.mockResolvedValueOnce({ exists: true, data: () => existingProfile });
    mockValidateUsername.mockReturnValueOnce('Username must be at least 3 characters');

    const res = await request(buildApp())
      .put('/users/me')
      .set('Authorization', VALID_TOKEN)
      .send({ username: 'ab' });

    expect(res.status).toBe(400);
    expect(res.body).toMatchObject({ error: 'Username must be at least 3 characters' });
  });

  it('returns 400 when username has invalid characters', async () => {
    const existingProfile = { ...TEST_PROFILE, username: 'test', usernameLower: 'test' };
    mockGet.mockResolvedValueOnce({ exists: true, data: () => existingProfile });
    mockValidateUsername.mockReturnValueOnce('Username may only contain letters, numbers, and underscores');

    const res = await request(buildApp())
      .put('/users/me')
      .set('Authorization', VALID_TOKEN)
      .send({ username: 'bad@name!' });

    expect(res.status).toBe(400);
    expect(res.body).toMatchObject({ error: 'Username may only contain letters, numbers, and underscores' });
  });

  it('returns 409 when username is already taken', async () => {
    const existingProfile = { ...TEST_PROFILE, username: 'oldname', usernameLower: 'oldname' };
    mockGet
      .mockResolvedValueOnce({ exists: true, data: () => existingProfile })  // exists check
      .mockResolvedValueOnce({ exists: true });                              // username already taken

    const res = await request(buildApp())
      .put('/users/me')
      .set('Authorization', VALID_TOKEN)
      .send({ username: 'TakenName' });

    expect(res.status).toBe(409);
    expect(res.body).toMatchObject({ error: 'Username already taken' });
  });

  it('releases old username reservation and creates new one atomically', async () => {
    const existingProfile = { ...TEST_PROFILE, username: 'oldname', usernameLower: 'oldname' };
    const updatedProfile = { ...existingProfile, username: 'newname', usernameLower: 'newname' };
    mockGet
      .mockResolvedValueOnce({ exists: true, data: () => existingProfile })
      .mockResolvedValueOnce({ exists: false })
      .mockResolvedValueOnce({ exists: true, data: () => updatedProfile });

    await request(buildApp())
      .put('/users/me')
      .set('Authorization', VALID_TOKEN)
      .send({ username: 'newname' });

    // batch.set for profile update (merge) + new reservation, batch.delete for old reservation
    expect(mockBatchSet).toHaveBeenCalledTimes(2);
    expect(mockBatchDelete).toHaveBeenCalledTimes(1);
    expect(mockBatchCommit).toHaveBeenCalledOnce();
  });

  it('allows case-only username change without uniqueness check', async () => {
    const existingProfile = { ...TEST_PROFILE, username: 'myname', usernameLower: 'myname' };
    const updatedProfile = { ...existingProfile, username: 'MyName' };
    mockGet
      .mockResolvedValueOnce({ exists: true, data: () => existingProfile })
      .mockResolvedValueOnce({ exists: true, data: () => updatedProfile });
    mockUpdate.mockResolvedValueOnce(undefined);

    const res = await request(buildApp())
      .put('/users/me')
      .set('Authorization', VALID_TOKEN)
      .send({ username: 'MyName' });

    expect(res.status).toBe(200);
    // Should use regular update, not batch (since lowercase is same)
    expect(mockUpdate).toHaveBeenCalledWith({ username: 'MyName' });
    expect(mockBatchSet).not.toHaveBeenCalled();
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

// ── GET /users/search ──────────────────────────────────────────────────────────

describe('GET /users/search', () => {
  it('returns 401 when unauthenticated', async () => {
    const res = await request(buildApp()).get('/users/search?q=test');
    expect(res.status).toBe(401);
  });

  it('returns 400 when q is less than 2 characters', async () => {
    const res = await request(buildApp())
      .get('/users/search?q=a')
      .set('Authorization', VALID_TOKEN);
    expect(res.status).toBe(400);
    expect(res.body).toMatchObject({ error: expect.stringContaining('2 characters') });
  });

  it('returns 400 when neither q nor email is provided', async () => {
    const res = await request(buildApp())
      .get('/users/search')
      .set('Authorization', VALID_TOKEN);
    expect(res.status).toBe(400);
  });

  it('returns matching users for q prefix search, excluding current user', async () => {
    const OTHER_USER = { uid: 'other-uid', email: 'alice@example.com', displayName: 'Alice' };
    mockCollectionGet.mockResolvedValueOnce({
      docs: [
        { data: () => ({ ...OTHER_USER }) },
        { data: () => ({ uid: TEST_UID, email: 'test@example.com', displayName: 'Test User' }) },
      ],
    });

    const res = await request(buildApp())
      .get('/users/search?q=ali')
      .set('Authorization', VALID_TOKEN);

    expect(res.status).toBe(200);
    expect(res.body).toEqual([{ uid: 'other-uid', displayName: 'Alice', email: 'alice@example.com' }]);
    expect(mockWhere).toHaveBeenCalledWith('email', '>=', 'ali');
  });

  it('returns empty array when no users match', async () => {
    mockCollectionGet.mockResolvedValueOnce({ docs: [] });

    const res = await request(buildApp())
      .get('/users/search?q=zzz')
      .set('Authorization', VALID_TOKEN);

    expect(res.status).toBe(200);
    expect(res.body).toEqual([]);
  });

  // Legacy exact email search
  it('returns single user for exact email search', async () => {
    mockCollectionGet.mockResolvedValueOnce({
      empty: false,
      docs: [{ data: () => ({ uid: 'uid-1', email: 'bob@example.com', displayName: 'Bob' }) }],
    });

    const res = await request(buildApp())
      .get('/users/search?email=bob@example.com')
      .set('Authorization', VALID_TOKEN);

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ uid: 'uid-1', displayName: 'Bob', email: 'bob@example.com' });
  });

  it('returns 404 for exact email search with no match', async () => {
    mockCollectionGet.mockResolvedValueOnce({ empty: true, docs: [] });

    const res = await request(buildApp())
      .get('/users/search?email=nonexistent@example.com')
      .set('Authorization', VALID_TOKEN);

    expect(res.status).toBe(404);
  });
});
