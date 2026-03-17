import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { FoodSearchResult } from '@burnbuddy/shared';

// --- Hoisted mocks ---
const { mockLogger, mockSearchFoods, mockGetFoodDetails, mockGetDb, mockDocRef, mockDocSnap } =
  vi.hoisted(() => {
    const mockDocSnap = {
      exists: false as boolean,
      data: vi.fn(),
    };
    const mockDocRef = {
      get: vi.fn().mockResolvedValue(mockDocSnap),
      set: vi.fn().mockResolvedValue(undefined),
    };
    const mockCollection = {
      doc: vi.fn().mockReturnValue(mockDocRef),
    };
    const mockDb = {
      collection: vi.fn().mockReturnValue(mockCollection),
    };
    return {
      mockLogger: {
        info: vi.fn(),
        warn: vi.fn(),
        error: vi.fn(),
        debug: vi.fn(),
      },
      mockSearchFoods: vi.fn(),
      mockGetFoodDetails: vi.fn(),
      mockGetDb: vi.fn().mockReturnValue(mockDb),
      mockDocRef,
      mockDocSnap,
    };
  });

vi.mock('../lib/logger', () => ({ logger: mockLogger }));
vi.mock('../lib/firestore', () => ({ getDb: mockGetDb }));
vi.mock('./usda-food-search', () => ({
  searchFoods: mockSearchFoods,
  getFoodDetails: mockGetFoodDetails,
}));

// Import after mocks
import {
  cachedSearchFoods,
  cachedGetFoodDetails,
  normalizeCacheKey,
  isCacheValid,
  CACHE_TTL_MS,
} from './food-search-cache';

const sampleResults: FoodSearchResult[] = [
  {
    fdcId: '12345',
    description: 'Chicken breast, raw',
    nutrients: [{ nutrientId: 'iron', amount: 0.7 }],
  },
  {
    fdcId: '67890',
    description: 'Salmon, Atlantic',
    brandOwner: 'BrandX',
    nutrients: [{ nutrientId: 'omega3', amount: 1.5 }],
  },
];

beforeEach(() => {
  vi.resetAllMocks();
  // Re-apply default mock chain after reset
  const mockCollection = { doc: vi.fn().mockReturnValue(mockDocRef) };
  mockGetDb.mockReturnValue({ collection: vi.fn().mockReturnValue(mockCollection) });
  mockDocRef.get.mockResolvedValue(mockDocSnap);
  mockDocRef.set.mockResolvedValue(undefined);
  mockDocSnap.exists = false;
  mockDocSnap.data.mockReturnValue(undefined);
});

describe('normalizeCacheKey', () => {
  it('lowercases and trims the query', () => {
    expect(normalizeCacheKey('  Chicken Breast  ')).toBe('chicken breast');
  });

  it('collapses excess whitespace', () => {
    expect(normalizeCacheKey('chicken   breast   raw')).toBe('chicken breast raw');
  });

  it('returns empty string for whitespace-only input', () => {
    expect(normalizeCacheKey('   ')).toBe('');
  });
});

describe('isCacheValid', () => {
  it('returns true for a recent cache entry', () => {
    const recent = new Date().toISOString();
    expect(isCacheValid(recent)).toBe(true);
  });

  it('returns false for an entry older than 30 days', () => {
    const old = new Date(Date.now() - CACHE_TTL_MS - 1000).toISOString();
    expect(isCacheValid(old)).toBe(false);
  });

  it('returns false for invalid date string', () => {
    expect(isCacheValid('not-a-date')).toBe(false);
  });

  it('returns true for entry exactly at boundary (just under 30 days)', () => {
    const justUnder = new Date(Date.now() - CACHE_TTL_MS + 60_000).toISOString();
    expect(isCacheValid(justUnder)).toBe(true);
  });
});

describe('cachedSearchFoods', () => {
  it('returns cached results on cache hit without calling USDA API', async () => {
    const cachedData = {
      query: 'chicken',
      results: sampleResults,
      cachedAt: new Date().toISOString(),
    };
    mockDocSnap.exists = true;
    mockDocSnap.data.mockReturnValue(cachedData);

    const results = await cachedSearchFoods('Chicken');

    expect(results).toEqual(sampleResults);
    expect(mockSearchFoods).not.toHaveBeenCalled();
    expect(mockLogger.debug).toHaveBeenCalledWith(
      { query: 'chicken' },
      'Food search cache hit'
    );
  });

  it('calls USDA API on cache miss and stores result', async () => {
    mockDocSnap.exists = false;
    mockSearchFoods.mockResolvedValueOnce(sampleResults);

    const results = await cachedSearchFoods('chicken');

    expect(results).toEqual(sampleResults);
    expect(mockSearchFoods).toHaveBeenCalledWith('chicken');
    expect(mockDocRef.set).toHaveBeenCalledWith(
      expect.objectContaining({
        query: 'chicken',
        results: sampleResults,
        cachedAt: expect.any(String),
      })
    );
  });

  it('calls USDA API when cache entry is expired (>30 days)', async () => {
    const expiredData = {
      query: 'chicken',
      results: [sampleResults[0]],
      cachedAt: new Date(Date.now() - CACHE_TTL_MS - 1000).toISOString(),
    };
    mockDocSnap.exists = true;
    mockDocSnap.data.mockReturnValue(expiredData);
    mockSearchFoods.mockResolvedValueOnce(sampleResults);

    const results = await cachedSearchFoods('chicken');

    expect(results).toEqual(sampleResults);
    expect(mockSearchFoods).toHaveBeenCalledWith('chicken');
    expect(mockLogger.debug).toHaveBeenCalledWith(
      { query: 'chicken' },
      'Food search cache expired'
    );
  });

  it('does not cache empty results', async () => {
    mockDocSnap.exists = false;
    mockSearchFoods.mockResolvedValueOnce([]);

    const results = await cachedSearchFoods('nonexistent food');

    expect(results).toEqual([]);
    expect(mockDocRef.set).not.toHaveBeenCalled();
  });

  it('falls back to USDA API when cache read fails', async () => {
    mockDocRef.get.mockRejectedValueOnce(new Error('Firestore unavailable'));
    mockSearchFoods.mockResolvedValueOnce(sampleResults);

    const results = await cachedSearchFoods('chicken');

    expect(results).toEqual(sampleResults);
    expect(mockLogger.warn).toHaveBeenCalledWith(
      expect.objectContaining({ err: expect.any(Error) }),
      'Food search cache read failed, falling back to USDA API'
    );
  });

  it('returns results even when cache write fails', async () => {
    mockDocSnap.exists = false;
    mockSearchFoods.mockResolvedValueOnce(sampleResults);
    mockDocRef.set.mockRejectedValueOnce(new Error('Write failed'));

    const results = await cachedSearchFoods('chicken');

    expect(results).toEqual(sampleResults);
    expect(mockLogger.warn).toHaveBeenCalledWith(
      expect.objectContaining({ err: expect.any(Error) }),
      'Food search cache write failed'
    );
  });

  it('normalizes query for cache key (case-insensitive, trimmed)', async () => {
    const cachedData = {
      query: 'chicken breast',
      results: sampleResults,
      cachedAt: new Date().toISOString(),
    };
    mockDocSnap.exists = true;
    mockDocSnap.data.mockReturnValue(cachedData);

    await cachedSearchFoods('  Chicken   Breast  ');

    // Verify it looked up the normalized key
    const db = mockGetDb();
    const collection = db.collection('foodCache');
    expect(collection.doc).toHaveBeenCalledWith('chicken breast');
  });
});

describe('cachedGetFoodDetails', () => {
  const sampleDetail: FoodSearchResult = {
    fdcId: '12345',
    description: 'Chicken breast, raw',
    nutrients: [{ nutrientId: 'iron', amount: 0.7 }],
  };

  it('returns cached result on cache hit without calling USDA API', async () => {
    const cachedData = {
      fdcId: '12345',
      results: [sampleDetail],
      cachedAt: new Date().toISOString(),
    };
    mockDocSnap.exists = true;
    mockDocSnap.data.mockReturnValue(cachedData);

    const result = await cachedGetFoodDetails('12345');

    expect(result).toEqual(sampleDetail);
    expect(mockGetFoodDetails).not.toHaveBeenCalled();
    expect(mockLogger.debug).toHaveBeenCalledWith(
      { fdcId: '12345' },
      'Food detail cache hit'
    );
  });

  it('calls USDA API on cache miss and stores result', async () => {
    mockDocSnap.exists = false;
    mockGetFoodDetails.mockResolvedValueOnce(sampleDetail);

    const result = await cachedGetFoodDetails('12345');

    expect(result).toEqual(sampleDetail);
    expect(mockGetFoodDetails).toHaveBeenCalledWith('12345');
    expect(mockDocRef.set).toHaveBeenCalledWith(
      expect.objectContaining({
        fdcId: '12345',
        results: [sampleDetail],
        cachedAt: expect.any(String),
      })
    );
  });

  it('calls USDA API when cache entry is expired', async () => {
    const expiredData = {
      fdcId: '12345',
      results: [sampleDetail],
      cachedAt: new Date(Date.now() - CACHE_TTL_MS - 1000).toISOString(),
    };
    mockDocSnap.exists = true;
    mockDocSnap.data.mockReturnValue(expiredData);
    mockGetFoodDetails.mockResolvedValueOnce(sampleDetail);

    const result = await cachedGetFoodDetails('12345');

    expect(result).toEqual(sampleDetail);
    expect(mockGetFoodDetails).toHaveBeenCalledWith('12345');
  });

  it('does not cache null results', async () => {
    mockDocSnap.exists = false;
    mockGetFoodDetails.mockResolvedValueOnce(null);

    const result = await cachedGetFoodDetails('99999');

    expect(result).toBeNull();
    expect(mockDocRef.set).not.toHaveBeenCalled();
  });

  it('uses fdc_ prefix for cache key', async () => {
    mockDocSnap.exists = false;
    mockGetFoodDetails.mockResolvedValueOnce(sampleDetail);

    await cachedGetFoodDetails('12345');

    const db = mockGetDb();
    const collection = db.collection('foodCache');
    expect(collection.doc).toHaveBeenCalledWith('fdc_12345');
  });

  it('falls back to USDA API when cache read fails', async () => {
    mockDocRef.get.mockRejectedValueOnce(new Error('Firestore unavailable'));
    mockGetFoodDetails.mockResolvedValueOnce(sampleDetail);

    const result = await cachedGetFoodDetails('12345');

    expect(result).toEqual(sampleDetail);
    expect(mockLogger.warn).toHaveBeenCalledWith(
      expect.objectContaining({ err: expect.any(Error) }),
      'Food detail cache read failed, falling back to USDA API'
    );
  });
});
