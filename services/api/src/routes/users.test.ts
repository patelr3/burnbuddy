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

// Mock cartoon service — prevents real Replicate API calls and missing API token errors
vi.mock('../services/replicate-cartoon-service', () => ({
  ReplicateCartoonService: vi.fn().mockImplementation(() => ({
    cartoonize: vi.fn().mockResolvedValue(Buffer.from('cartoon-image-data')),
  })),
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
    // Profile is written via docRef.set() (username already reserved in generateUniqueUsername)
    expect(mockSet).toHaveBeenCalledOnce();
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

  it('delegates username reservation to generateUniqueUsername (atomic create)', async () => {
    mockGet.mockResolvedValueOnce({ exists: false });
    mockGenerateUniqueUsername.mockResolvedValueOnce({ username: 'alice', usernameLower: 'alice' });

    const res = await request(buildApp())
      .post('/users')
      .set('Authorization', VALID_TOKEN)
      .send({ email: 'alice@example.com', displayName: 'Alice' });

    expect(res.status).toBe(201);
    // Username reservation is now handled atomically inside generateUniqueUsername
    // using doc.create(), so the route only does a single docRef.set for the profile
    expect(mockSet).toHaveBeenCalledOnce();
    expect(mockGenerateUniqueUsername).toHaveBeenCalledWith('alice@example.com', expect.anything(), TEST_UID);
  });

  it('calls generateUniqueUsername with the email and uid', async () => {
    mockGet.mockResolvedValueOnce({ exists: false });

    await request(buildApp())
      .post('/users')
      .set('Authorization', VALID_TOKEN)
      .send({ email: 'bob@test.com', displayName: 'Bob' });

    expect(mockGenerateUniqueUsername).toHaveBeenCalledWith('bob@test.com', expect.anything(), TEST_UID);
  });

  it('includes timezone in the created profile when provided', async () => {
    mockGet.mockResolvedValueOnce({ exists: false });
    mockGenerateUniqueUsername.mockResolvedValueOnce({ username: 'test', usernameLower: 'test' });

    const res = await request(buildApp())
      .post('/users')
      .set('Authorization', VALID_TOKEN)
      .send({ email: 'test@example.com', displayName: 'Test User', timezone: 'America/New_York' });

    expect(res.status).toBe(201);
    expect(res.body.timezone).toBe('America/New_York');
  });

  it('ignores empty string timezone on profile creation', async () => {
    mockGet.mockResolvedValueOnce({ exists: false });
    mockGenerateUniqueUsername.mockResolvedValueOnce({ username: 'test', usernameLower: 'test' });

    const res = await request(buildApp())
      .post('/users')
      .set('Authorization', VALID_TOKEN)
      .send({ email: 'test@example.com', displayName: 'Test User', timezone: '' });

    expect(res.status).toBe(201);
    expect(res.body.timezone).toBeUndefined();
  });

  it('ignores non-string timezone on profile creation', async () => {
    mockGet.mockResolvedValueOnce({ exists: false });
    mockGenerateUniqueUsername.mockResolvedValueOnce({ username: 'test', usernameLower: 'test' });

    const res = await request(buildApp())
      .post('/users')
      .set('Authorization', VALID_TOKEN)
      .send({ email: 'test@example.com', displayName: 'Test User', timezone: 123 });

    expect(res.status).toBe(201);
    expect(res.body.timezone).toBeUndefined();
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

  it('returns profilePictureStatus "processing" when cartoon conversion is in progress', async () => {
    const profile = { ...TEST_PROFILE, profilePictureStatus: 'processing' };
    mockGet.mockResolvedValueOnce({ exists: true, data: () => profile });

    const res = await request(buildApp())
      .get('/users/me')
      .set('Authorization', VALID_TOKEN);

    expect(res.status).toBe(200);
    expect(res.body.profilePictureStatus).toBe('processing');
    expect(res.body.profilePictureUrl).toBeUndefined();
  });

  it('returns profilePictureStatus "ready" with profilePictureUrl when cartoon is complete', async () => {
    const profile = {
      ...TEST_PROFILE,
      profilePictureStatus: 'ready',
      profilePictureUrl: 'https://storage.example.com/profile-pictures/user-abc-123/avatar.jpeg',
    };
    mockGet.mockResolvedValueOnce({ exists: true, data: () => profile });

    const res = await request(buildApp())
      .get('/users/me')
      .set('Authorization', VALID_TOKEN);

    expect(res.status).toBe(200);
    expect(res.body.profilePictureStatus).toBe('ready');
    expect(res.body.profilePictureUrl).toBe('https://storage.example.com/profile-pictures/user-abc-123/avatar.jpeg');
  });

  it('returns profilePictureStatus "failed" when cartoon conversion failed', async () => {
    const profile = { ...TEST_PROFILE, profilePictureStatus: 'failed' };
    mockGet.mockResolvedValueOnce({ exists: true, data: () => profile });

    const res = await request(buildApp())
      .get('/users/me')
      .set('Authorization', VALID_TOKEN);

    expect(res.status).toBe(200);
    expect(res.body.profilePictureStatus).toBe('failed');
    expect(res.body.profilePictureUrl).toBeUndefined();
  });

  it('returns profilePictureStatus null when user has no profile picture', async () => {
    const profile = { ...TEST_PROFILE, profilePictureStatus: null };
    mockGet.mockResolvedValueOnce({ exists: true, data: () => profile });

    const res = await request(buildApp())
      .get('/users/me')
      .set('Authorization', VALID_TOKEN);

    expect(res.status).toBe(200);
    expect(res.body.profilePictureStatus).toBeNull();
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
    // Profile is written via docRef.set() — username reserved atomically in generateUniqueUsername
    expect(mockSet).toHaveBeenCalledOnce();
    expect(mockGenerateUniqueUsername).toHaveBeenCalledWith('newuser@example.com', expect.anything(), TEST_UID);
  });

  it('delegates username reservation to generateUniqueUsername on create path', async () => {
    mockGet.mockResolvedValueOnce({ exists: false });
    mockGenerateUniqueUsername.mockResolvedValueOnce({ username: 'alice', usernameLower: 'alice' });

    const res = await request(buildApp())
      .put('/users/me')
      .set('Authorization', VALID_TOKEN)
      .send({ email: 'alice@example.com', displayName: 'Alice' });

    expect(res.status).toBe(201);
    // Username reservation is now handled atomically inside generateUniqueUsername
    expect(mockSet).toHaveBeenCalledOnce();
    expect(mockGenerateUniqueUsername).toHaveBeenCalledWith('alice@example.com', expect.anything(), TEST_UID);
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
    expect(mockGenerateUniqueUsername).toHaveBeenCalledWith('test@example.com', expect.anything(), TEST_UID);
    // Username reserved atomically in generateUniqueUsername, profile updated via set with merge
    expect(mockSet).toHaveBeenCalledOnce();
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
    expect(mockGenerateUniqueUsername).toHaveBeenCalledWith('new@example.com', expect.anything(), TEST_UID);
  });

  it('lazy migration delegates username reservation to generateUniqueUsername', async () => {
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

    // Username reserved atomically in generateUniqueUsername, profile updated via set with merge
    expect(mockSet).toHaveBeenCalledOnce();
    expect(mockGenerateUniqueUsername).toHaveBeenCalledWith('test@example.com', expect.anything(), TEST_UID);
    // Should NOT use docRef.update — uses set with merge instead
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

  it('updates timezone when profile exists', async () => {
    const existingProfile = { ...TEST_PROFILE, username: 'test', usernameLower: 'test' };
    const updatedProfile = { ...existingProfile, timezone: 'Europe/London' };
    mockGet
      .mockResolvedValueOnce({ exists: true, data: () => existingProfile })
      .mockResolvedValueOnce({ exists: true, data: () => updatedProfile });
    mockUpdate.mockResolvedValueOnce(undefined);

    const res = await request(buildApp())
      .put('/users/me')
      .set('Authorization', VALID_TOKEN)
      .send({ timezone: 'Europe/London' });

    expect(res.status).toBe(200);
    expect(res.body.timezone).toBe('Europe/London');
    expect(mockUpdate).toHaveBeenCalledWith({ timezone: 'Europe/London' });
  });

  it('does not include timezone in updates when not provided', async () => {
    const existingProfile = { ...TEST_PROFILE, username: 'test', usernameLower: 'test', timezone: 'America/New_York' };
    const updatedProfile = { ...existingProfile, displayName: 'Updated Name' };
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
    // Timezone should not be in the update call since it wasn't sent
    expect(mockUpdate).toHaveBeenCalledWith({ displayName: 'Updated Name' });
  });

  it('ignores empty string timezone on profile update', async () => {
    const existingProfile = { ...TEST_PROFILE, username: 'test', usernameLower: 'test' };
    mockGet
      .mockResolvedValueOnce({ exists: true, data: () => existingProfile })
      .mockResolvedValueOnce({ exists: true, data: () => existingProfile });
    mockUpdate.mockResolvedValueOnce(undefined);

    const res = await request(buildApp())
      .put('/users/me')
      .set('Authorization', VALID_TOKEN)
      .send({ timezone: '' });

    expect(res.status).toBe(200);
    // Empty timezone should not appear in updates
    expect(mockUpdate).toHaveBeenCalledWith({});
  });

  it('includes timezone when creating profile via PUT /users/me', async () => {
    mockGet.mockResolvedValueOnce({ exists: false });
    mockGenerateUniqueUsername.mockResolvedValueOnce({ username: 'newuser', usernameLower: 'newuser' });

    const res = await request(buildApp())
      .put('/users/me')
      .set('Authorization', VALID_TOKEN)
      .send({ email: 'newuser@example.com', displayName: 'New User', timezone: 'Asia/Tokyo' });

    expect(res.status).toBe(201);
    expect(res.body.timezone).toBe('Asia/Tokyo');
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
    const OTHER_USER = { uid: 'other-uid', email: 'alice@example.com', displayName: 'Alice', username: 'alice' };
    // Email query results
    mockCollectionGet.mockResolvedValueOnce({
      docs: [
        { data: () => ({ ...OTHER_USER }) },
        { data: () => ({ uid: TEST_UID, email: 'test@example.com', displayName: 'Test User' }) },
      ],
    });
    // Username query results (empty)
    mockCollectionGet.mockResolvedValueOnce({ docs: [] });

    const res = await request(buildApp())
      .get('/users/search?q=ali')
      .set('Authorization', VALID_TOKEN);

    expect(res.status).toBe(200);
    expect(res.body).toEqual([{ uid: 'other-uid', displayName: 'Alice', email: 'alice@example.com', username: 'alice' }]);
    expect(mockWhere).toHaveBeenCalledWith('email', '>=', 'ali');
    expect(mockWhere).toHaveBeenCalledWith('usernameLower', '>=', 'ali');
  });

  it('returns empty array when no users match', async () => {
    mockCollectionGet.mockResolvedValueOnce({ docs: [] });
    mockCollectionGet.mockResolvedValueOnce({ docs: [] });

    const res = await request(buildApp())
      .get('/users/search?q=zzz')
      .set('Authorization', VALID_TOKEN);

    expect(res.status).toBe(200);
    expect(res.body).toEqual([]);
  });

  it('returns matching users for username prefix search', async () => {
    const USER = { uid: 'uid-2', email: 'bob@example.com', displayName: 'Bob', username: 'bobster', usernameLower: 'bobster' };
    // Email query results (empty)
    mockCollectionGet.mockResolvedValueOnce({ docs: [] });
    // Username query results
    mockCollectionGet.mockResolvedValueOnce({
      docs: [{ data: () => ({ ...USER }) }],
    });

    const res = await request(buildApp())
      .get('/users/search?q=bob')
      .set('Authorization', VALID_TOKEN);

    expect(res.status).toBe(200);
    expect(res.body).toEqual([{ uid: 'uid-2', displayName: 'Bob', email: 'bob@example.com', username: 'bobster' }]);
    expect(mockWhere).toHaveBeenCalledWith('usernameLower', '>=', 'bob');
  });

  it('deduplicates results found by both email and username', async () => {
    const USER = { uid: 'uid-3', email: 'charlie@example.com', displayName: 'Charlie', username: 'charlie', usernameLower: 'charlie' };
    // Email query returns the user
    mockCollectionGet.mockResolvedValueOnce({
      docs: [{ data: () => ({ ...USER }) }],
    });
    // Username query also returns the same user
    mockCollectionGet.mockResolvedValueOnce({
      docs: [{ data: () => ({ ...USER }) }],
    });

    const res = await request(buildApp())
      .get('/users/search?q=charlie')
      .set('Authorization', VALID_TOKEN);

    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(1);
    expect(res.body[0].uid).toBe('uid-3');
  });

  it('uses lowercase query for username prefix search', async () => {
    mockCollectionGet.mockResolvedValueOnce({ docs: [] });
    mockCollectionGet.mockResolvedValueOnce({ docs: [] });

    await request(buildApp())
      .get('/users/search?q=AlIcE')
      .set('Authorization', VALID_TOKEN);

    expect(mockWhere).toHaveBeenCalledWith('email', '>=', 'AlIcE');
    expect(mockWhere).toHaveBeenCalledWith('usernameLower', '>=', 'alice');
  });

  it('limits combined results to 10', async () => {
    const makeUsers = (prefix: string, count: number) =>
      Array.from({ length: count }, (_, i) => ({
        data: () => ({
          uid: `${prefix}-${i}`,
          email: `${prefix}${i}@example.com`,
          displayName: `User ${prefix}${i}`,
          username: `${prefix}${i}`,
        }),
      }));
    // Email query returns 8 users
    mockCollectionGet.mockResolvedValueOnce({ docs: makeUsers('email', 8) });
    // Username query returns 5 users
    mockCollectionGet.mockResolvedValueOnce({ docs: makeUsers('uname', 5) });

    const res = await request(buildApp())
      .get('/users/search?q=te')
      .set('Authorization', VALID_TOKEN);

    expect(res.status).toBe(200);
    expect(res.body.length).toBeLessThanOrEqual(10);
  });

  // Legacy exact email search
  it('returns single user for exact email search', async () => {
    mockCollectionGet.mockResolvedValueOnce({
      empty: false,
      docs: [{ data: () => ({ uid: 'uid-1', email: 'bob@example.com', displayName: 'Bob', username: 'bob' }) }],
    });

    const res = await request(buildApp())
      .get('/users/search?email=bob@example.com')
      .set('Authorization', VALID_TOKEN);

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ uid: 'uid-1', displayName: 'Bob', email: 'bob@example.com', username: 'bob' });
  });

  it('returns 404 for exact email search with no match', async () => {
    mockCollectionGet.mockResolvedValueOnce({ empty: true, docs: [] });

    const res = await request(buildApp())
      .get('/users/search?email=nonexistent@example.com')
      .set('Authorization', VALID_TOKEN);

    expect(res.status).toBe(404);
  });
});

// ── TLA+ Verification Gap Tests ───────────────────────────────────────────────

/**
 * Gap G-3 — UsernameUniqueness (UserProfileManagement.tla)
 *
 * RESOLVED: generateUniqueUsername() now uses doc.create() (which fails with
 * ALREADY_EXISTS if the doc exists) to atomically reserve usernames. Concurrent
 * profile creations for the same email prefix will no longer silently overwrite
 * each other's reservation — the loser retries with the next suffix.
 */
describe('TLA+ Gap G-3: UsernameUniqueness — atomic reservation via doc.create()', () => {
  it('uses generateUniqueUsername with uid for atomic reservation', async () => {
    // Profile does not exist yet
    mockGet.mockResolvedValueOnce({ exists: false });
    mockGenerateUniqueUsername.mockResolvedValueOnce({ username: 'alice', usernameLower: 'alice' });

    const res = await request(buildApp())
      .post('/users')
      .set('Authorization', VALID_TOKEN)
      .send({ email: 'alice@example.com', displayName: 'Alice' });

    expect(res.status).toBe(201);

    // generateUniqueUsername is called with uid so it can atomically reserve via doc.create()
    expect(mockGenerateUniqueUsername).toHaveBeenCalledWith('alice@example.com', expect.anything(), TEST_UID);

    // Profile is written via a single docRef.set() — no batch needed since
    // username reservation is already done atomically in generateUniqueUsername
    expect(mockSet).toHaveBeenCalledOnce();
  });
});

/**
 * Gap G-4 — ProfileRequiredForSocialActions / CDI-1 (CrossDomainInvariants.tla)
 *
 * None of the social action routes verify the user has a Firestore profile.
 * This test documents that POST /users (profile creation) itself does not enforce
 * a profile requirement (it creates one), but the pattern is that downstream routes
 * should check — and they don't.
 *
 * See also: friends.test.ts, burn-buddies.test.ts, burn-squads.test.ts, workouts.test.ts
 * for matching G-4 tests on social action endpoints.
 */
