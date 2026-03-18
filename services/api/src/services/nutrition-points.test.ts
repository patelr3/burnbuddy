import { describe, it, expect, vi, beforeEach } from 'vitest';

const {
  mockGoalsDocGet,
  mockGoalsDocRef,
  mockMealsQueryGet,
  mockMealsQueryChain,
  mockMealsCollectionWhere,
  mockAwardDocGet,
  mockAwardDocSet,
  mockAwardDocDelete,
  mockAwardDocRef,
  mockMonthlyDocSet,
  mockMonthlyDocRef,
  mockFieldValueIncrement,
  mockLoggerDebug,
  mockLoggerInfo,
  mockLoggerError,
} = vi.hoisted(() => {
  const mockGoalsDocGet = vi.fn();
  const mockGoalsDocRef = vi.fn(() => ({
    get: mockGoalsDocGet,
  }));

  const mockMealsQueryGet = vi.fn();
  const mockMealsQueryChain = {
    where: vi.fn(),
    get: mockMealsQueryGet,
  };
  const mockMealsCollectionWhere = vi.fn(() => mockMealsQueryChain);

  const mockAwardDocGet = vi.fn();
  const mockAwardDocSet = vi.fn();
  const mockAwardDocDelete = vi.fn();
  const mockAwardDocRef = vi.fn(() => ({
    get: mockAwardDocGet,
    set: mockAwardDocSet,
    delete: mockAwardDocDelete,
  }));

  const mockMonthlyDocSet = vi.fn();
  const mockMonthlyDocRef = vi.fn(() => ({
    set: mockMonthlyDocSet,
  }));

  const mockFieldValueIncrement = vi.fn((n: number) => `__INCREMENT_${n}__`);

  const mockLoggerDebug = vi.fn();
  const mockLoggerInfo = vi.fn();
  const mockLoggerError = vi.fn();

  return {
    mockGoalsDocGet,
    mockGoalsDocRef,
    mockMealsQueryGet,
    mockMealsQueryChain,
    mockMealsCollectionWhere,
    mockAwardDocGet,
    mockAwardDocSet,
    mockAwardDocDelete,
    mockAwardDocRef,
    mockMonthlyDocSet,
    mockMonthlyDocRef,
    mockFieldValueIncrement,
    mockLoggerDebug,
    mockLoggerInfo,
    mockLoggerError,
  };
});

vi.mock('firebase-admin/firestore', () => ({
  FieldValue: {
    increment: mockFieldValueIncrement,
  },
}));

vi.mock('../lib/firestore', () => ({
  getDb: () => ({
    collection: (name: string) => {
      if (name === 'nutritionGoals') {
        return { doc: mockGoalsDocRef };
      }
      if (name === 'mealEntries') {
        return { where: mockMealsCollectionWhere };
      }
      if (name === 'nutritionPointsAwarded') {
        return { doc: mockAwardDocRef };
      }
      if (name === 'monthlyPoints') {
        return { doc: mockMonthlyDocRef };
      }
      return {};
    },
  }),
}));

vi.mock('../lib/logger', () => ({
  logger: {
    debug: mockLoggerDebug,
    info: mockLoggerInfo,
    warn: vi.fn(),
    error: mockLoggerError,
  },
}));

import { evaluateNutritionPoints } from './nutrition-points';

const TEST_UID = 'user-abc';
const TEST_DATE = '2026-03-15';

describe('evaluateNutritionPoints', () => {
  beforeEach(() => {
    vi.resetAllMocks();

    // Re-wire mocks after reset
    mockGoalsDocRef.mockImplementation(() => ({
      get: mockGoalsDocGet,
    }));

    mockMealsCollectionWhere.mockReturnValue(mockMealsQueryChain);
    mockMealsQueryChain.where.mockReturnThis();

    mockAwardDocRef.mockImplementation(() => ({
      get: mockAwardDocGet,
      set: mockAwardDocSet,
      delete: mockAwardDocDelete,
    }));

    mockMonthlyDocRef.mockImplementation(() => ({
      set: mockMonthlyDocSet,
    }));

    // Default: no goals set
    mockGoalsDocGet.mockResolvedValue({ exists: false });
    // Default: no meals
    mockMealsQueryGet.mockResolvedValue({ docs: [] });
    // Default: no awards
    mockAwardDocGet.mockResolvedValue({ exists: false });
    // Default: writes succeed
    mockAwardDocSet.mockResolvedValue(undefined);
    mockAwardDocDelete.mockResolvedValue(undefined);
    mockMonthlyDocSet.mockResolvedValue(undefined);
  });

  it('skips evaluation when user has no nutrition goals', async () => {
    mockGoalsDocGet.mockResolvedValue({ exists: false });

    await evaluateNutritionPoints(TEST_UID, TEST_DATE);

    expect(mockGoalsDocRef).toHaveBeenCalledWith(TEST_UID);
    expect(mockMealsCollectionWhere).not.toHaveBeenCalled();
    expect(mockLoggerDebug).toHaveBeenCalledWith(
      expect.objectContaining({ uid: TEST_UID }),
      expect.stringContaining('No nutrition goals'),
    );
  });

  it('skips evaluation when target nutrients array is empty', async () => {
    mockGoalsDocGet.mockResolvedValue({
      exists: true,
      data: () => ({ uid: TEST_UID, targetNutrients: [], updatedAt: '2026-01-01' }),
    });

    await evaluateNutritionPoints(TEST_UID, TEST_DATE);

    expect(mockMealsCollectionWhere).not.toHaveBeenCalled();
  });

  it('awards a point when nutrient hits 100% of daily recommended', async () => {
    // Goals: target iron (dailyRecommended: 18mg)
    mockGoalsDocGet.mockResolvedValue({
      exists: true,
      data: () => ({ uid: TEST_UID, targetNutrients: ['iron'], updatedAt: '2026-01-01' }),
    });

    // Meals: one meal with 20mg iron (> 18mg recommended)
    mockMealsQueryGet.mockResolvedValue({
      docs: [
        {
          data: () => ({
            uid: TEST_UID,
            date: TEST_DATE,
            nutrients: [{ nutrientId: 'iron', amount: 20 }],
          }),
        },
      ],
    });

    // No existing award
    mockAwardDocGet.mockResolvedValue({ exists: false });

    await evaluateNutritionPoints(TEST_UID, TEST_DATE);

    // Should create award tracking doc
    expect(mockAwardDocRef).toHaveBeenCalledWith(`${TEST_UID}_${TEST_DATE}_iron`);
    expect(mockAwardDocSet).toHaveBeenCalledWith(
      expect.objectContaining({
        uid: TEST_UID,
        date: TEST_DATE,
        nutrientId: 'iron',
      }),
    );

    // Should increment monthly points
    expect(mockMonthlyDocRef).toHaveBeenCalledWith(`${TEST_UID}_2026-03`);
    expect(mockMonthlyDocSet).toHaveBeenCalledWith(
      expect.objectContaining({
        uid: TEST_UID,
        month: '2026-03',
        points: '__INCREMENT_1__',
      }),
      { merge: true },
    );

    expect(mockFieldValueIncrement).toHaveBeenCalledWith(1);
    expect(mockLoggerInfo).toHaveBeenCalledWith(
      expect.objectContaining({ nutrientId: 'iron' }),
      'Nutrition point awarded',
    );
  });

  it('awards a point when nutrient is exactly at 100%', async () => {
    mockGoalsDocGet.mockResolvedValue({
      exists: true,
      data: () => ({ uid: TEST_UID, targetNutrients: ['calcium'], updatedAt: '2026-01-01' }),
    });

    // calcium dailyRecommended: 1000mg — exactly 1000
    mockMealsQueryGet.mockResolvedValue({
      docs: [
        {
          data: () => ({
            uid: TEST_UID,
            date: TEST_DATE,
            nutrients: [{ nutrientId: 'calcium', amount: 1000 }],
          }),
        },
      ],
    });

    mockAwardDocGet.mockResolvedValue({ exists: false });

    await evaluateNutritionPoints(TEST_UID, TEST_DATE);

    expect(mockAwardDocSet).toHaveBeenCalled();
    expect(mockMonthlyDocSet).toHaveBeenCalled();
  });

  it('does not double-award for the same nutrient and date', async () => {
    mockGoalsDocGet.mockResolvedValue({
      exists: true,
      data: () => ({ uid: TEST_UID, targetNutrients: ['iron'], updatedAt: '2026-01-01' }),
    });

    mockMealsQueryGet.mockResolvedValue({
      docs: [
        {
          data: () => ({
            uid: TEST_UID,
            date: TEST_DATE,
            nutrients: [{ nutrientId: 'iron', amount: 20 }],
          }),
        },
      ],
    });

    // Already awarded
    mockAwardDocGet.mockResolvedValue({ exists: true });

    await evaluateNutritionPoints(TEST_UID, TEST_DATE);

    expect(mockAwardDocSet).not.toHaveBeenCalled();
    expect(mockMonthlyDocSet).not.toHaveBeenCalled();
  });

  it('revokes point when meal deletion drops nutrient below 100%', async () => {
    mockGoalsDocGet.mockResolvedValue({
      exists: true,
      data: () => ({ uid: TEST_UID, targetNutrients: ['iron'], updatedAt: '2026-01-01' }),
    });

    // After deletion, only 10mg iron left (< 18mg recommended)
    mockMealsQueryGet.mockResolvedValue({
      docs: [
        {
          data: () => ({
            uid: TEST_UID,
            date: TEST_DATE,
            nutrients: [{ nutrientId: 'iron', amount: 10 }],
          }),
        },
      ],
    });

    // Point was previously awarded
    mockAwardDocGet.mockResolvedValue({ exists: true });

    await evaluateNutritionPoints(TEST_UID, TEST_DATE);

    // Should delete award tracking doc
    expect(mockAwardDocDelete).toHaveBeenCalled();

    // Should decrement monthly points
    expect(mockFieldValueIncrement).toHaveBeenCalledWith(-1);
    expect(mockMonthlyDocSet).toHaveBeenCalledWith(
      expect.objectContaining({
        uid: TEST_UID,
        month: '2026-03',
        points: '__INCREMENT_-1__',
      }),
      { merge: true },
    );

    expect(mockLoggerInfo).toHaveBeenCalledWith(
      expect.objectContaining({ nutrientId: 'iron' }),
      'Nutrition point revoked',
    );
  });

  it('evaluates multiple target nutrients independently', async () => {
    mockGoalsDocGet.mockResolvedValue({
      exists: true,
      data: () => ({
        uid: TEST_UID,
        targetNutrients: ['iron', 'vitaminC', 'calcium'],
        updatedAt: '2026-01-01',
      }),
    });

    // iron: 20mg (>= 18 → award), vitaminC: 50mg (< 90 → no award), calcium: 1200mg (>= 1000 → award)
    mockMealsQueryGet.mockResolvedValue({
      docs: [
        {
          data: () => ({
            uid: TEST_UID,
            date: TEST_DATE,
            nutrients: [
              { nutrientId: 'iron', amount: 20 },
              { nutrientId: 'vitaminC', amount: 50 },
              { nutrientId: 'calcium', amount: 1200 },
            ],
          }),
        },
      ],
    });

    // None previously awarded
    mockAwardDocGet.mockResolvedValue({ exists: false });

    await evaluateNutritionPoints(TEST_UID, TEST_DATE);

    // Should check all three
    expect(mockAwardDocRef).toHaveBeenCalledWith(`${TEST_UID}_${TEST_DATE}_iron`);
    expect(mockAwardDocRef).toHaveBeenCalledWith(`${TEST_UID}_${TEST_DATE}_vitaminC`);
    expect(mockAwardDocRef).toHaveBeenCalledWith(`${TEST_UID}_${TEST_DATE}_calcium`);

    // Should award 2 points (iron + calcium), not vitaminC
    expect(mockAwardDocSet).toHaveBeenCalledTimes(2);
    expect(mockMonthlyDocSet).toHaveBeenCalledTimes(2);
  });

  it('sums nutrients across multiple meals', async () => {
    mockGoalsDocGet.mockResolvedValue({
      exists: true,
      data: () => ({ uid: TEST_UID, targetNutrients: ['iron'], updatedAt: '2026-01-01' }),
    });

    // Two meals: 10mg + 10mg = 20mg iron (>= 18mg recommended)
    mockMealsQueryGet.mockResolvedValue({
      docs: [
        {
          data: () => ({
            uid: TEST_UID,
            date: TEST_DATE,
            nutrients: [{ nutrientId: 'iron', amount: 10 }],
          }),
        },
        {
          data: () => ({
            uid: TEST_UID,
            date: TEST_DATE,
            nutrients: [{ nutrientId: 'iron', amount: 10 }],
          }),
        },
      ],
    });

    mockAwardDocGet.mockResolvedValue({ exists: false });

    await evaluateNutritionPoints(TEST_UID, TEST_DATE);

    expect(mockAwardDocSet).toHaveBeenCalled();
    expect(mockMonthlyDocSet).toHaveBeenCalled();
  });

  it('does not award when nutrient is below 100%', async () => {
    mockGoalsDocGet.mockResolvedValue({
      exists: true,
      data: () => ({ uid: TEST_UID, targetNutrients: ['iron'], updatedAt: '2026-01-01' }),
    });

    // 10mg iron (< 18mg recommended)
    mockMealsQueryGet.mockResolvedValue({
      docs: [
        {
          data: () => ({
            uid: TEST_UID,
            date: TEST_DATE,
            nutrients: [{ nutrientId: 'iron', amount: 10 }],
          }),
        },
      ],
    });

    mockAwardDocGet.mockResolvedValue({ exists: false });

    await evaluateNutritionPoints(TEST_UID, TEST_DATE);

    // Should not award or revoke
    expect(mockAwardDocSet).not.toHaveBeenCalled();
    expect(mockAwardDocDelete).not.toHaveBeenCalled();
    expect(mockMonthlyDocSet).not.toHaveBeenCalled();
  });

  it('handles meals with no nutrients gracefully', async () => {
    mockGoalsDocGet.mockResolvedValue({
      exists: true,
      data: () => ({ uid: TEST_UID, targetNutrients: ['iron'], updatedAt: '2026-01-01' }),
    });

    mockMealsQueryGet.mockResolvedValue({
      docs: [
        {
          data: () => ({
            uid: TEST_UID,
            date: TEST_DATE,
            nutrients: undefined,
          }),
        },
      ],
    });

    mockAwardDocGet.mockResolvedValue({ exists: false });

    await evaluateNutritionPoints(TEST_UID, TEST_DATE);

    // Should not throw or award
    expect(mockAwardDocSet).not.toHaveBeenCalled();
  });

  it('logs error but does not throw when Firestore write fails', async () => {
    mockGoalsDocGet.mockResolvedValue({
      exists: true,
      data: () => ({ uid: TEST_UID, targetNutrients: ['iron'], updatedAt: '2026-01-01' }),
    });

    mockMealsQueryGet.mockResolvedValue({
      docs: [
        {
          data: () => ({
            uid: TEST_UID,
            date: TEST_DATE,
            nutrients: [{ nutrientId: 'iron', amount: 20 }],
          }),
        },
      ],
    });

    mockAwardDocGet.mockResolvedValue({ exists: false });
    mockAwardDocSet.mockRejectedValue(new Error('Firestore write failed'));

    // Should not throw
    await evaluateNutritionPoints(TEST_UID, TEST_DATE);

    expect(mockLoggerError).toHaveBeenCalledWith(
      expect.objectContaining({ uid: TEST_UID, nutrientId: 'iron' }),
      'Failed to evaluate nutrition point',
    );
  });

  it('handles no meals on the date (zero consumed)', async () => {
    mockGoalsDocGet.mockResolvedValue({
      exists: true,
      data: () => ({ uid: TEST_UID, targetNutrients: ['iron'], updatedAt: '2026-01-01' }),
    });

    mockMealsQueryGet.mockResolvedValue({ docs: [] });

    // Previously awarded point should be revoked
    mockAwardDocGet.mockResolvedValue({ exists: true });

    await evaluateNutritionPoints(TEST_UID, TEST_DATE);

    expect(mockAwardDocDelete).toHaveBeenCalled();
    expect(mockFieldValueIncrement).toHaveBeenCalledWith(-1);
  });

  it('respects max 3 target nutrients (only evaluates given targets)', async () => {
    // Max 3 targets enforced by goals validation; service just evaluates what's given
    mockGoalsDocGet.mockResolvedValue({
      exists: true,
      data: () => ({
        uid: TEST_UID,
        targetNutrients: ['iron', 'calcium', 'vitaminD'],
        updatedAt: '2026-01-01',
      }),
    });

    // All at 100%: iron=18, calcium=1000, vitaminD=20
    mockMealsQueryGet.mockResolvedValue({
      docs: [
        {
          data: () => ({
            uid: TEST_UID,
            date: TEST_DATE,
            nutrients: [
              { nutrientId: 'iron', amount: 18 },
              { nutrientId: 'calcium', amount: 1000 },
              { nutrientId: 'vitaminD', amount: 20 },
            ],
          }),
        },
      ],
    });

    mockAwardDocGet.mockResolvedValue({ exists: false });

    await evaluateNutritionPoints(TEST_UID, TEST_DATE);

    // All 3 should be awarded (max 3 points per day)
    expect(mockAwardDocSet).toHaveBeenCalledTimes(3);
    expect(mockMonthlyDocSet).toHaveBeenCalledTimes(3);
  });

  it('uses correct month from date for monthlyPoints doc ID', async () => {
    const decDate = '2025-12-25';

    mockGoalsDocGet.mockResolvedValue({
      exists: true,
      data: () => ({ uid: TEST_UID, targetNutrients: ['iron'], updatedAt: '2026-01-01' }),
    });

    mockMealsQueryGet.mockResolvedValue({
      docs: [
        {
          data: () => ({
            uid: TEST_UID,
            date: decDate,
            nutrients: [{ nutrientId: 'iron', amount: 20 }],
          }),
        },
      ],
    });

    mockAwardDocGet.mockResolvedValue({ exists: false });

    await evaluateNutritionPoints(TEST_UID, decDate);

    expect(mockMonthlyDocRef).toHaveBeenCalledWith(`${TEST_UID}_2025-12`);
  });
});
