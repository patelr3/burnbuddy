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
const OTHER_UID = 'user-other-456';
const TEST_PROFILE = {
  uid: TEST_UID,
  email: 'test@example.com',
  displayName: 'Test User',
  username: 'testuser',
  usernameLower: 'testuser',
  createdAt: '2026-01-01T00:00:00.000Z',
};

const HEALTH_PROFILE = {
  ...TEST_PROFILE,
  heightCm: 175,
  weightKg: 70,
  dateOfBirth: '1990-06-15',
  workoutGoal: 'stay_active' as const,
  unitPreference: 'metric' as const,
  healthProfilePromptDismissed: true,
};

beforeEach(() => {
  vi.resetAllMocks();
  mockVerifyIdToken.mockResolvedValue({ uid: TEST_UID });
  mockDocRef.mockReturnValue({ get: mockGet, set: mockSet, update: mockUpdate });
  mockWhere.mockReturnValue({ where: mockWhere, limit: mockLimit, get: mockCollectionGet });
  mockLimit.mockReturnValue({ get: mockCollectionGet });
  mockBatch.mockReturnValue({ set: mockBatchSet, delete: mockBatchDelete, commit: mockBatchCommit });
  mockBatchCommit.mockResolvedValue(undefined);
  mockGenerateUniqueUsername.mockResolvedValue({ username: 'testuser', usernameLower: 'testuser' });
  mockValidateUsername.mockReturnValue(null);
});

// ── PUT /users/me — Health field validation ────────────────────────────────────

describe('PUT /users/me — health fields', () => {
  // Helper: set up existing profile for update path
  function setupExistingProfile(profile = TEST_PROFILE, updatedProfile = profile) {
    mockGet
      .mockResolvedValueOnce({ exists: true, data: () => profile })
      .mockResolvedValueOnce({ exists: true, data: () => updatedProfile });
    mockUpdate.mockResolvedValue(undefined);
  }

  describe('valid health fields are saved', () => {
    it('saves heightCm when valid', async () => {
      const updated = { ...TEST_PROFILE, heightCm: 180 };
      setupExistingProfile(TEST_PROFILE, updated);

      const res = await request(buildApp())
        .put('/users/me')
        .set('Authorization', VALID_TOKEN)
        .send({ heightCm: 180 });

      expect(res.status).toBe(200);
      expect(res.body.heightCm).toBe(180);
      expect(mockUpdate).toHaveBeenCalledWith(expect.objectContaining({ heightCm: 180 }));
    });

    it('saves weightKg when valid', async () => {
      const updated = { ...TEST_PROFILE, weightKg: 75 };
      setupExistingProfile(TEST_PROFILE, updated);

      const res = await request(buildApp())
        .put('/users/me')
        .set('Authorization', VALID_TOKEN)
        .send({ weightKg: 75 });

      expect(res.status).toBe(200);
      expect(res.body.weightKg).toBe(75);
      expect(mockUpdate).toHaveBeenCalledWith(expect.objectContaining({ weightKg: 75 }));
    });

    it('saves dateOfBirth when valid', async () => {
      const updated = { ...TEST_PROFILE, dateOfBirth: '1990-06-15' };
      setupExistingProfile(TEST_PROFILE, updated);

      const res = await request(buildApp())
        .put('/users/me')
        .set('Authorization', VALID_TOKEN)
        .send({ dateOfBirth: '1990-06-15' });

      expect(res.status).toBe(200);
      expect(res.body.dateOfBirth).toBe('1990-06-15');
      expect(mockUpdate).toHaveBeenCalledWith(expect.objectContaining({ dateOfBirth: '1990-06-15' }));
    });

    it('saves workoutGoal when valid', async () => {
      const updated = { ...TEST_PROFILE, workoutGoal: 'build_muscle' };
      setupExistingProfile(TEST_PROFILE, updated);

      const res = await request(buildApp())
        .put('/users/me')
        .set('Authorization', VALID_TOKEN)
        .send({ workoutGoal: 'build_muscle' });

      expect(res.status).toBe(200);
      expect(res.body.workoutGoal).toBe('build_muscle');
      expect(mockUpdate).toHaveBeenCalledWith(expect.objectContaining({ workoutGoal: 'build_muscle' }));
    });

    it('saves unitPreference when valid', async () => {
      const updated = { ...TEST_PROFILE, unitPreference: 'imperial' };
      setupExistingProfile(TEST_PROFILE, updated);

      const res = await request(buildApp())
        .put('/users/me')
        .set('Authorization', VALID_TOKEN)
        .send({ unitPreference: 'imperial' });

      expect(res.status).toBe(200);
      expect(res.body.unitPreference).toBe('imperial');
      expect(mockUpdate).toHaveBeenCalledWith(expect.objectContaining({ unitPreference: 'imperial' }));
    });

    it('saves healthProfilePromptDismissed when valid', async () => {
      const updated = { ...TEST_PROFILE, healthProfilePromptDismissed: true };
      setupExistingProfile(TEST_PROFILE, updated);

      const res = await request(buildApp())
        .put('/users/me')
        .set('Authorization', VALID_TOKEN)
        .send({ healthProfilePromptDismissed: true });

      expect(res.status).toBe(200);
      expect(res.body.healthProfilePromptDismissed).toBe(true);
      expect(mockUpdate).toHaveBeenCalledWith(expect.objectContaining({ healthProfilePromptDismissed: true }));
    });

    it('saves multiple health fields at once', async () => {
      const updated = { ...TEST_PROFILE, heightCm: 170, weightKg: 65, workoutGoal: 'lose_weight' };
      setupExistingProfile(TEST_PROFILE, updated);

      const res = await request(buildApp())
        .put('/users/me')
        .set('Authorization', VALID_TOKEN)
        .send({ heightCm: 170, weightKg: 65, workoutGoal: 'lose_weight' });

      expect(res.status).toBe(200);
      expect(mockUpdate).toHaveBeenCalledWith(
        expect.objectContaining({ heightCm: 170, weightKg: 65, workoutGoal: 'lose_weight' }),
      );
    });

    it('saves all five workout goal values', async () => {
      const goals = ['lose_weight', 'build_muscle', 'stay_active', 'improve_endurance', 'reduce_stress'];
      for (const goal of goals) {
        vi.resetAllMocks();
        mockVerifyIdToken.mockResolvedValue({ uid: TEST_UID });
        mockDocRef.mockReturnValue({ get: mockGet, set: mockSet, update: mockUpdate });
        mockValidateUsername.mockReturnValue(null);

        const updated = { ...TEST_PROFILE, workoutGoal: goal };
        mockGet
          .mockResolvedValueOnce({ exists: true, data: () => TEST_PROFILE })
          .mockResolvedValueOnce({ exists: true, data: () => updated });
        mockUpdate.mockResolvedValue(undefined);

        const res = await request(buildApp())
          .put('/users/me')
          .set('Authorization', VALID_TOKEN)
          .send({ workoutGoal: goal });

        expect(res.status).toBe(200);
        expect(res.body.workoutGoal).toBe(goal);
      }
    });
  });

  // ── heightCm validation ──────────────────────────────────────────────────────

  describe('heightCm validation', () => {
    it('returns 400 when heightCm is below 50', async () => {
      mockGet.mockResolvedValueOnce({ exists: true, data: () => TEST_PROFILE });

      const res = await request(buildApp())
        .put('/users/me')
        .set('Authorization', VALID_TOKEN)
        .send({ heightCm: 49 });

      expect(res.status).toBe(400);
      expect(res.body.error).toContain('heightCm');
    });

    it('returns 400 when heightCm is above 300', async () => {
      mockGet.mockResolvedValueOnce({ exists: true, data: () => TEST_PROFILE });

      const res = await request(buildApp())
        .put('/users/me')
        .set('Authorization', VALID_TOKEN)
        .send({ heightCm: 301 });

      expect(res.status).toBe(400);
      expect(res.body.error).toContain('heightCm');
    });

    it('returns 400 when heightCm is not a number', async () => {
      mockGet.mockResolvedValueOnce({ exists: true, data: () => TEST_PROFILE });

      const res = await request(buildApp())
        .put('/users/me')
        .set('Authorization', VALID_TOKEN)
        .send({ heightCm: 'tall' });

      expect(res.status).toBe(400);
      expect(res.body.error).toContain('heightCm');
    });

    it('accepts heightCm at boundary values (50 and 300)', async () => {
      // Test lower boundary
      const updated50 = { ...TEST_PROFILE, heightCm: 50 };
      setupExistingProfile(TEST_PROFILE, updated50);

      const res50 = await request(buildApp())
        .put('/users/me')
        .set('Authorization', VALID_TOKEN)
        .send({ heightCm: 50 });

      expect(res50.status).toBe(200);

      // Reset for upper boundary test
      vi.resetAllMocks();
      mockVerifyIdToken.mockResolvedValue({ uid: TEST_UID });
      mockDocRef.mockReturnValue({ get: mockGet, set: mockSet, update: mockUpdate });
      mockValidateUsername.mockReturnValue(null);

      const updated300 = { ...TEST_PROFILE, heightCm: 300 };
      mockGet
        .mockResolvedValueOnce({ exists: true, data: () => TEST_PROFILE })
        .mockResolvedValueOnce({ exists: true, data: () => updated300 });
      mockUpdate.mockResolvedValue(undefined);

      const res300 = await request(buildApp())
        .put('/users/me')
        .set('Authorization', VALID_TOKEN)
        .send({ heightCm: 300 });

      expect(res300.status).toBe(200);
    });
  });

  // ── weightKg validation ──────────────────────────────────────────────────────

  describe('weightKg validation', () => {
    it('returns 400 when weightKg is below 10', async () => {
      mockGet.mockResolvedValueOnce({ exists: true, data: () => TEST_PROFILE });

      const res = await request(buildApp())
        .put('/users/me')
        .set('Authorization', VALID_TOKEN)
        .send({ weightKg: 9 });

      expect(res.status).toBe(400);
      expect(res.body.error).toContain('weightKg');
    });

    it('returns 400 when weightKg is above 500', async () => {
      mockGet.mockResolvedValueOnce({ exists: true, data: () => TEST_PROFILE });

      const res = await request(buildApp())
        .put('/users/me')
        .set('Authorization', VALID_TOKEN)
        .send({ weightKg: 501 });

      expect(res.status).toBe(400);
      expect(res.body.error).toContain('weightKg');
    });

    it('returns 400 when weightKg is not a number', async () => {
      mockGet.mockResolvedValueOnce({ exists: true, data: () => TEST_PROFILE });

      const res = await request(buildApp())
        .put('/users/me')
        .set('Authorization', VALID_TOKEN)
        .send({ weightKg: 'heavy' });

      expect(res.status).toBe(400);
      expect(res.body.error).toContain('weightKg');
    });
  });

  // ── dateOfBirth validation ───────────────────────────────────────────────────

  describe('dateOfBirth validation', () => {
    it('returns 400 when dateOfBirth is a future date', async () => {
      mockGet.mockResolvedValueOnce({ exists: true, data: () => TEST_PROFILE });

      const futureDate = new Date(Date.now() + 86400000).toISOString().split('T')[0];
      const res = await request(buildApp())
        .put('/users/me')
        .set('Authorization', VALID_TOKEN)
        .send({ dateOfBirth: futureDate });

      expect(res.status).toBe(400);
      expect(res.body.error).toContain('dateOfBirth');
    });

    it('returns 400 when user would be under 13', async () => {
      mockGet.mockResolvedValueOnce({ exists: true, data: () => TEST_PROFILE });

      // A date 5 years ago — user would be 5 years old
      const fiveYearsAgo = new Date();
      fiveYearsAgo.setFullYear(fiveYearsAgo.getFullYear() - 5);
      const res = await request(buildApp())
        .put('/users/me')
        .set('Authorization', VALID_TOKEN)
        .send({ dateOfBirth: fiveYearsAgo.toISOString().split('T')[0] });

      expect(res.status).toBe(400);
      expect(res.body.error).toContain('13');
    });

    it('returns 400 when dateOfBirth is not a valid date string', async () => {
      mockGet.mockResolvedValueOnce({ exists: true, data: () => TEST_PROFILE });

      const res = await request(buildApp())
        .put('/users/me')
        .set('Authorization', VALID_TOKEN)
        .send({ dateOfBirth: 'not-a-date' });

      expect(res.status).toBe(400);
      expect(res.body.error).toContain('dateOfBirth');
    });

    it('returns 400 when dateOfBirth is not a string', async () => {
      mockGet.mockResolvedValueOnce({ exists: true, data: () => TEST_PROFILE });

      const res = await request(buildApp())
        .put('/users/me')
        .set('Authorization', VALID_TOKEN)
        .send({ dateOfBirth: 12345 });

      expect(res.status).toBe(400);
      expect(res.body.error).toContain('dateOfBirth');
    });
  });

  // ── workoutGoal validation ───────────────────────────────────────────────────

  describe('workoutGoal validation', () => {
    it('returns 400 when workoutGoal is invalid', async () => {
      mockGet.mockResolvedValueOnce({ exists: true, data: () => TEST_PROFILE });

      const res = await request(buildApp())
        .put('/users/me')
        .set('Authorization', VALID_TOKEN)
        .send({ workoutGoal: 'fly_to_the_moon' });

      expect(res.status).toBe(400);
      expect(res.body.error).toContain('workoutGoal');
    });
  });

  // ── unitPreference validation ────────────────────────────────────────────────

  describe('unitPreference validation', () => {
    it('returns 400 when unitPreference is invalid', async () => {
      mockGet.mockResolvedValueOnce({ exists: true, data: () => TEST_PROFILE });

      const res = await request(buildApp())
        .put('/users/me')
        .set('Authorization', VALID_TOKEN)
        .send({ unitPreference: 'furlongs' });

      expect(res.status).toBe(400);
      expect(res.body.error).toContain('unitPreference');
    });
  });

  // ── healthProfilePromptDismissed validation ──────────────────────────────────

  describe('healthProfilePromptDismissed validation', () => {
    it('returns 400 when healthProfilePromptDismissed is not a boolean', async () => {
      mockGet.mockResolvedValueOnce({ exists: true, data: () => TEST_PROFILE });

      const res = await request(buildApp())
        .put('/users/me')
        .set('Authorization', VALID_TOKEN)
        .send({ healthProfilePromptDismissed: 'yes' });

      expect(res.status).toBe(400);
      expect(res.body.error).toContain('healthProfilePromptDismissed');
    });
  });

  // ── null values clear fields ─────────────────────────────────────────────────

  describe('null values clear fields', () => {
    it('clears heightCm when null is sent', async () => {
      const updated = { ...TEST_PROFILE };
      setupExistingProfile(HEALTH_PROFILE, updated);

      const res = await request(buildApp())
        .put('/users/me')
        .set('Authorization', VALID_TOKEN)
        .send({ heightCm: null });

      expect(res.status).toBe(200);
      // Verify FieldValue.delete() was used (it's an object with a special _methodName)
      expect(mockUpdate).toHaveBeenCalledWith(
        expect.objectContaining({
          heightCm: expect.anything(),
        }),
      );
    });

    it('clears workoutGoal when null is sent', async () => {
      const updated = { ...TEST_PROFILE };
      setupExistingProfile(HEALTH_PROFILE, updated);

      const res = await request(buildApp())
        .put('/users/me')
        .set('Authorization', VALID_TOKEN)
        .send({ workoutGoal: null });

      expect(res.status).toBe(200);
      expect(mockUpdate).toHaveBeenCalledWith(
        expect.objectContaining({
          workoutGoal: expect.anything(),
        }),
      );
    });

    it('clears weightKg when null is sent', async () => {
      const updated = { ...TEST_PROFILE };
      setupExistingProfile(HEALTH_PROFILE, updated);

      const res = await request(buildApp())
        .put('/users/me')
        .set('Authorization', VALID_TOKEN)
        .send({ weightKg: null });

      expect(res.status).toBe(200);
      expect(mockUpdate).toHaveBeenCalledWith(
        expect.objectContaining({
          weightKg: expect.anything(),
        }),
      );
    });

    it('clears dateOfBirth when null is sent', async () => {
      const updated = { ...TEST_PROFILE };
      setupExistingProfile(HEALTH_PROFILE, updated);

      const res = await request(buildApp())
        .put('/users/me')
        .set('Authorization', VALID_TOKEN)
        .send({ dateOfBirth: null });

      expect(res.status).toBe(200);
      expect(mockUpdate).toHaveBeenCalledWith(
        expect.objectContaining({
          dateOfBirth: expect.anything(),
        }),
      );
    });
  });
});

// ── Privacy: health fields in public vs private responses ──────────────────────

describe('Health field privacy', () => {
  it('GET /users/me includes health fields', async () => {
    mockGet.mockResolvedValueOnce({ exists: true, data: () => HEALTH_PROFILE });

    const res = await request(buildApp())
      .get('/users/me')
      .set('Authorization', VALID_TOKEN);

    expect(res.status).toBe(200);
    expect(res.body.heightCm).toBe(175);
    expect(res.body.weightKg).toBe(70);
    expect(res.body.dateOfBirth).toBe('1990-06-15');
    expect(res.body.workoutGoal).toBe('stay_active');
    expect(res.body.unitPreference).toBe('metric');
    expect(res.body.healthProfilePromptDismissed).toBe(true);
  });

  it('GET /users/:uid does NOT include health fields', async () => {
    mockVerifyIdToken.mockResolvedValue({ uid: OTHER_UID });
    mockGet.mockResolvedValueOnce({ exists: true, data: () => HEALTH_PROFILE });

    const res = await request(buildApp())
      .get(`/users/${TEST_UID}`)
      .set('Authorization', VALID_TOKEN);

    expect(res.status).toBe(200);
    expect(res.body.uid).toBe(TEST_UID);
    expect(res.body.displayName).toBe('Test User');
    expect(res.body).not.toHaveProperty('heightCm');
    expect(res.body).not.toHaveProperty('weightKg');
    expect(res.body).not.toHaveProperty('dateOfBirth');
    expect(res.body).not.toHaveProperty('workoutGoal');
    expect(res.body).not.toHaveProperty('unitPreference');
    expect(res.body).not.toHaveProperty('healthProfilePromptDismissed');
  });
});
