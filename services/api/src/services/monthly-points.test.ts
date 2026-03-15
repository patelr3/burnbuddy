import { describe, it, expect, vi, beforeEach } from 'vitest';

const {
  mockMonthlyPointsDocSet,
  mockMonthlyPointsDocRef,
  mockFieldValueIncrement,
  mockLoggerError,
} = vi.hoisted(() => {
  const mockMonthlyPointsDocSet = vi.fn();
  const mockMonthlyPointsDocRef = vi.fn(() => ({ set: mockMonthlyPointsDocSet }));
  const mockFieldValueIncrement = vi.fn((n: number) => `__INCREMENT_${n}__`);
  const mockLoggerError = vi.fn();

  return {
    mockMonthlyPointsDocSet,
    mockMonthlyPointsDocRef,
    mockFieldValueIncrement,
    mockLoggerError,
  };
});

vi.mock('../lib/firestore', () => ({
  getDb: () => ({
    collection: (name: string) => {
      if (name === 'monthlyPoints') {
        return { doc: mockMonthlyPointsDocRef };
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

import { awardGroupWorkoutPoints, getCurrentMonth } from './monthly-points';

beforeEach(() => {
  vi.resetAllMocks();
  mockMonthlyPointsDocRef.mockReturnValue({ set: mockMonthlyPointsDocSet });
  mockFieldValueIncrement.mockImplementation((n: number) => `__INCREMENT_${n}__`);
  mockMonthlyPointsDocSet.mockResolvedValue(undefined);
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
