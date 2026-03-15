import { describe, it, expect, vi, beforeEach } from 'vitest';

const {
  mockMonthlyPointsDocSet,
  mockMonthlyPointsDocDelete,
  mockMonthlyPointsDocRef,
  mockMonthlyPointsQueryGet,
  mockMonthlyPointsQueryChain,
  mockFieldValueIncrement,
  mockLoggerError,
} = vi.hoisted(() => {
  const mockMonthlyPointsDocSet = vi.fn();
  const mockMonthlyPointsDocDelete = vi.fn();
  const mockMonthlyPointsDocRef = vi.fn(() => ({
    set: mockMonthlyPointsDocSet,
    delete: mockMonthlyPointsDocDelete,
  }));
  const mockMonthlyPointsQueryGet = vi.fn();
  const mockMonthlyPointsQueryChain = {
    where: vi.fn(),
    get: mockMonthlyPointsQueryGet,
  };
  const mockFieldValueIncrement = vi.fn((n: number) => `__INCREMENT_${n}__`);
  const mockLoggerError = vi.fn();

  return {
    mockMonthlyPointsDocSet,
    mockMonthlyPointsDocDelete,
    mockMonthlyPointsDocRef,
    mockMonthlyPointsQueryGet,
    mockMonthlyPointsQueryChain,
    mockFieldValueIncrement,
    mockLoggerError,
  };
});

vi.mock('../lib/firestore', () => ({
  getDb: () => ({
    collection: (name: string) => {
      if (name === 'monthlyPoints') {
        return {
          doc: mockMonthlyPointsDocRef,
          where: () => mockMonthlyPointsQueryChain,
        };
      }
      return {};
    },
  }),
}));

vi.mock('firebase-admin/firestore', () => ({
  FieldValue: {
    increment: mockFieldValueIncrement,
  },
}));

vi.mock('../lib/logger', () => ({
  logger: {
    error: mockLoggerError,
    info: vi.fn(),
    warn: vi.fn(),
  },
}));

import { awardGroupWorkoutPoints, getCurrentMonth, getCutoffMonth, pruneOldMonthlyPoints } from './monthly-points';

function emptySnap() {
  return { empty: true, docs: [] };
}

function snapOf(...items: Array<{ id: string; data: object }>) {
  return {
    empty: items.length === 0,
    docs: items.map((item) => ({ id: item.id, data: () => item.data })),
  };
}

beforeEach(() => {
  vi.resetAllMocks();
  mockMonthlyPointsDocRef.mockReturnValue({
    set: mockMonthlyPointsDocSet,
    delete: mockMonthlyPointsDocDelete,
  });
  mockMonthlyPointsQueryChain.where.mockReturnThis();
  mockFieldValueIncrement.mockImplementation((n: number) => `__INCREMENT_${n}__`);
  mockMonthlyPointsDocSet.mockResolvedValue(undefined);
  mockMonthlyPointsDocDelete.mockResolvedValue(undefined);
  // Default: no docs to prune
  mockMonthlyPointsQueryGet.mockResolvedValue(emptySnap());
});

describe('getCurrentMonth', () => {
  it('returns the current month in YYYY-MM format', () => {
    const result = getCurrentMonth();
    expect(result).toMatch(/^\d{4}-\d{2}$/);

    const now = new Date();
    const expected = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
    expect(result).toBe(expected);
  });
});

describe('awardGroupWorkoutPoints', () => {
  it('creates a monthly points document on first group workout', async () => {
    await awardGroupWorkoutPoints(['user-a']);

    const month = getCurrentMonth();
    expect(mockMonthlyPointsDocRef).toHaveBeenCalledWith(`user-a_${month}`);
    expect(mockMonthlyPointsDocSet).toHaveBeenCalledWith(
      expect.objectContaining({
        uid: 'user-a',
        month,
        points: '__INCREMENT_1__',
      }),
      { merge: true },
    );
    expect(mockFieldValueIncrement).toHaveBeenCalledWith(1);
  });

  it('increments points using FieldValue.increment for atomic updates', async () => {
    await awardGroupWorkoutPoints(['user-a']);

    expect(mockFieldValueIncrement).toHaveBeenCalledWith(1);
    expect(mockMonthlyPointsDocSet).toHaveBeenCalledWith(
      expect.objectContaining({ points: '__INCREMENT_1__' }),
      { merge: true },
    );
  });

  it('awards points to all group members', async () => {
    const members = ['user-a', 'user-b', 'user-c'];
    await awardGroupWorkoutPoints(members);

    const month = getCurrentMonth();
    expect(mockMonthlyPointsDocRef).toHaveBeenCalledTimes(3);
    expect(mockMonthlyPointsDocRef).toHaveBeenCalledWith(`user-a_${month}`);
    expect(mockMonthlyPointsDocRef).toHaveBeenCalledWith(`user-b_${month}`);
    expect(mockMonthlyPointsDocRef).toHaveBeenCalledWith(`user-c_${month}`);
    expect(mockMonthlyPointsDocSet).toHaveBeenCalledTimes(3);
  });

  it('uses set with merge:true to handle non-existent documents', async () => {
    await awardGroupWorkoutPoints(['user-a']);

    expect(mockMonthlyPointsDocSet).toHaveBeenCalledWith(
      expect.anything(),
      { merge: true },
    );
  });

  it('includes updatedAt timestamp in ISO 8601 format', async () => {
    await awardGroupWorkoutPoints(['user-a']);

    expect(mockMonthlyPointsDocSet).toHaveBeenCalledWith(
      expect.objectContaining({
        updatedAt: expect.stringMatching(/^\d{4}-\d{2}-\d{2}T/),
      }),
      { merge: true },
    );
  });

  it('logs error but does not throw when a single member update fails', async () => {
    mockMonthlyPointsDocSet
      .mockResolvedValueOnce(undefined) // user-a succeeds
      .mockRejectedValueOnce(new Error('Firestore write failed')); // user-b fails

    // Should not throw
    await awardGroupWorkoutPoints(['user-a', 'user-b']);

    expect(mockLoggerError).toHaveBeenCalledWith(
      expect.objectContaining({ uid: 'user-b' }),
      'Failed to award monthly point',
    );
  });

  it('handles empty member list gracefully', async () => {
    await awardGroupWorkoutPoints([]);

    expect(mockMonthlyPointsDocRef).not.toHaveBeenCalled();
    expect(mockMonthlyPointsDocSet).not.toHaveBeenCalled();
  });
});

describe('getCutoffMonth', () => {
  it('returns the month 12 months before the given date', () => {
    // March 2026 → March 2025
    const result = getCutoffMonth(new Date(2026, 2, 15));
    expect(result).toBe('2025-03');
  });

  it('handles year boundary correctly', () => {
    // January 2026 → January 2025
    const result = getCutoffMonth(new Date(2026, 0, 10));
    expect(result).toBe('2025-01');
  });
});

describe('pruneOldMonthlyPoints', () => {
  it('deletes documents older than 12 months', async () => {
    const cutoff = getCutoffMonth();

    // Create a month that is definitely older than 12 months
    const oldMonth = '2020-01';
    mockMonthlyPointsQueryGet.mockResolvedValueOnce(
      snapOf(
        { id: `user-a_${oldMonth}`, data: { uid: 'user-a', month: oldMonth, points: 5 } },
      ),
    );

    await pruneOldMonthlyPoints('user-a');

    expect(mockMonthlyPointsDocRef).toHaveBeenCalledWith(`user-a_${oldMonth}`);
    expect(mockMonthlyPointsDocDelete).toHaveBeenCalledOnce();
  });

  it('keeps documents within 12 months', async () => {
    const recentMonth = getCurrentMonth();
    mockMonthlyPointsQueryGet.mockResolvedValueOnce(
      snapOf(
        { id: `user-a_${recentMonth}`, data: { uid: 'user-a', month: recentMonth, points: 3 } },
      ),
    );

    await pruneOldMonthlyPoints('user-a');

    // doc() should not be called for delete
    expect(mockMonthlyPointsDocDelete).not.toHaveBeenCalled();
  });

  it('deletes only old documents when mixed with recent ones', async () => {
    const recentMonth = getCurrentMonth();
    const oldMonth = '2020-06';

    mockMonthlyPointsQueryGet.mockResolvedValueOnce(
      snapOf(
        { id: `user-a_${recentMonth}`, data: { uid: 'user-a', month: recentMonth, points: 3 } },
        { id: `user-a_${oldMonth}`, data: { uid: 'user-a', month: oldMonth, points: 10 } },
      ),
    );

    await pruneOldMonthlyPoints('user-a');

    // Only the old doc should be deleted
    expect(mockMonthlyPointsDocRef).toHaveBeenCalledWith(`user-a_${oldMonth}`);
    expect(mockMonthlyPointsDocDelete).toHaveBeenCalledOnce();
  });

  it('does nothing when there are no documents', async () => {
    mockMonthlyPointsQueryGet.mockResolvedValueOnce(emptySnap());

    await pruneOldMonthlyPoints('user-a');

    expect(mockMonthlyPointsDocDelete).not.toHaveBeenCalled();
  });

  it('logs error but does not throw when pruning fails', async () => {
    mockMonthlyPointsQueryGet.mockRejectedValueOnce(new Error('Query failed'));

    // Should not throw
    await pruneOldMonthlyPoints('user-a');

    expect(mockLoggerError).toHaveBeenCalledWith(
      expect.objectContaining({ uid: 'user-a' }),
      'Failed to prune old monthly points',
    );
  });
});
