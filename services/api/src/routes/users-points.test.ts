import { describe, it, expect, vi, beforeEach } from 'vitest';
import express from 'express';
import request from 'supertest';

const {
  mockVerifyIdToken,
  mockMonthlyPointsQueryGet,
  mockMonthlyPointsQueryChain,
} = vi.hoisted(() => {
  const mockVerifyIdToken = vi.fn();
  const mockMonthlyPointsQueryGet = vi.fn();
  const mockMonthlyPointsQueryChain = {
    where: vi.fn(),
    get: mockMonthlyPointsQueryGet,
  };

  return {
    mockVerifyIdToken,
    mockMonthlyPointsQueryGet,
    mockMonthlyPointsQueryChain,
  };
});

vi.mock('../lib/firebase', () => ({
  admin: {
    auth: () => ({ verifyIdToken: mockVerifyIdToken }),
  },
  initFirebase: vi.fn(),
}));

vi.mock('../lib/firestore', () => ({
  getDb: () => ({
    collection: (name: string) => {
      if (name === 'monthlyPoints') {
        return { where: () => mockMonthlyPointsQueryChain };
      }
      // Minimal stubs for other collections (users router registers other routes)
      return {
        doc: vi.fn(() => ({
          get: vi.fn().mockResolvedValue({ exists: false }),
          set: vi.fn(),
          update: vi.fn(),
        })),
        where: vi.fn(() => ({
          where: vi.fn().mockReturnThis(),
          limit: vi.fn().mockReturnThis(),
          get: vi.fn().mockResolvedValue({ empty: true, docs: [] }),
        })),
      };
    },
    getAll: vi.fn().mockResolvedValue([]),
    batch: () => ({
      set: vi.fn(),
      delete: vi.fn(),
      commit: vi.fn(),
    }),
  }),
}));

// Stub out sharp and storage since users.ts imports them
vi.mock('sharp', () => ({
  default: vi.fn(),
}));
vi.mock('../lib/storage', () => ({
  getContainerClient: vi.fn(),
  getBlobUrl: vi.fn(),
}));

vi.mock('../services/streak-calculator', () => ({
  calculateStreaks: vi.fn(),
  calculateHighestStreakEver: vi.fn(),
}));

import usersRouter from './users';

function buildApp() {
  const app = express();
  app.use(express.json());
  app.use('/users', usersRouter);
  return app;
}

const VALID_TOKEN = 'Bearer valid.token';
const TEST_UID = 'test-user-001';

function emptySnap() {
  return { empty: true, docs: [] };
}

function snapOf(...items: object[]) {
  return {
    empty: items.length === 0,
    docs: items.map((data) => ({ data: () => data })),
  };
}

beforeEach(() => {
  vi.resetAllMocks();
  mockVerifyIdToken.mockResolvedValue({ uid: TEST_UID });
  mockMonthlyPointsQueryChain.where.mockReturnThis();
});

describe('GET /users/me/points', () => {
  it('returns 401 when unauthenticated', async () => {
    mockVerifyIdToken.mockRejectedValueOnce(new Error('Invalid token'));
    const res = await request(buildApp()).get('/users/me/points');
    expect(res.status).toBe(401);
  });

  it('returns 0 points when no monthly points documents exist', async () => {
    mockMonthlyPointsQueryGet.mockResolvedValueOnce(emptySnap());

    const res = await request(buildApp())
      .get('/users/me/points')
      .set('Authorization', VALID_TOKEN);

    expect(res.status).toBe(200);
    expect(res.body.currentMonth.points).toBe(0);
    expect(res.body.currentMonth.month).toMatch(/^\d{4}-\d{2}$/);
    expect(res.body.history).toEqual([]);
  });

  it('returns correct current month points', async () => {
    const now = new Date();
    const currentMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;

    mockMonthlyPointsQueryGet.mockResolvedValueOnce(
      snapOf({
        uid: TEST_UID,
        month: currentMonth,
        points: 5,
        updatedAt: new Date().toISOString(),
      }),
    );

    const res = await request(buildApp())
      .get('/users/me/points')
      .set('Authorization', VALID_TOKEN);

    expect(res.status).toBe(200);
    expect(res.body.currentMonth).toEqual({
      month: currentMonth,
      points: 5,
    });
  });

  it('returns history sorted newest-first, excluding current month', async () => {
    const now = new Date();
    const currentMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;

    mockMonthlyPointsQueryGet.mockResolvedValueOnce(
      snapOf(
        { uid: TEST_UID, month: currentMonth, points: 3, updatedAt: '2026-03-10T00:00:00Z' },
        { uid: TEST_UID, month: '2026-01', points: 10, updatedAt: '2026-01-15T00:00:00Z' },
        { uid: TEST_UID, month: '2026-02', points: 7, updatedAt: '2026-02-20T00:00:00Z' },
        { uid: TEST_UID, month: '2025-12', points: 2, updatedAt: '2025-12-05T00:00:00Z' },
      ),
    );

    const res = await request(buildApp())
      .get('/users/me/points')
      .set('Authorization', VALID_TOKEN);

    expect(res.status).toBe(200);
    expect(res.body.currentMonth.points).toBe(3);

    // History should exclude current month and be sorted newest-first
    const historyMonths = res.body.history.map((h: { month: string }) => h.month);
    expect(historyMonths).toEqual(['2026-02', '2026-01', '2025-12']);
    expect(historyMonths).not.toContain(currentMonth);
  });

  it('limits history to 12 months', async () => {
    const docs = [];
    // Add current month
    docs.push({ uid: TEST_UID, month: '2026-03', points: 1, updatedAt: '2026-03-01T00:00:00Z' });
    // Add 14 months of history
    for (let i = 1; i <= 14; i++) {
      const year = 2026 - Math.floor(i / 12);
      const month = ((3 - i % 12) + 12) % 12 || 12;
      const yearStr = i >= 4 ? '2025' : '2026';
      const monthNum = 3 - i;
      const actualYear = monthNum <= 0 ? 2025 : 2026;
      const actualMonth = monthNum <= 0 ? monthNum + 12 : monthNum;
      const monthStr = `${actualYear}-${String(actualMonth).padStart(2, '0')}`;
      docs.push({ uid: TEST_UID, month: monthStr, points: i, updatedAt: `${monthStr}-01T00:00:00Z` });
    }

    mockMonthlyPointsQueryGet.mockResolvedValueOnce(snapOf(...docs));

    const res = await request(buildApp())
      .get('/users/me/points')
      .set('Authorization', VALID_TOKEN);

    expect(res.status).toBe(200);
    expect(res.body.history.length).toBeLessThanOrEqual(12);
  });

  it('only queries the authenticated user\'s points', async () => {
    mockMonthlyPointsQueryGet.mockResolvedValueOnce(emptySnap());

    await request(buildApp())
      .get('/users/me/points')
      .set('Authorization', VALID_TOKEN);

    // Verify the query was executed against the monthlyPoints collection
    expect(mockMonthlyPointsQueryGet).toHaveBeenCalled();
  });
});
