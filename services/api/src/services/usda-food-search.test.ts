import { describe, it, expect, vi, beforeEach } from 'vitest';

const { mockLogger } = vi.hoisted(() => {
  const mockLogger = {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  };
  return { mockLogger };
});

vi.mock('../lib/logger', () => ({ logger: mockLogger }));

// Import after mocks
import {
  searchFoods,
  getFoodDetails,
  USDA_NUTRIENT_MAP,
  extractNutrientsFromSearch,
  extractNutrientsFromDetail,
} from './usda-food-search';

const mockFetch = vi.fn();
vi.stubGlobal('fetch', mockFetch);

beforeEach(() => {
  vi.resetAllMocks();
  process.env.USDA_API_KEY = 'test-api-key';
});

describe('USDA nutrient mapping', () => {
  it('maps known USDA nutrient IDs to our NutrientId strings', () => {
    expect(USDA_NUTRIENT_MAP[1089]).toBe('iron');
    expect(USDA_NUTRIENT_MAP[1114]).toBe('vitaminD');
    expect(USDA_NUTRIENT_MAP[1087]).toBe('calcium');
    expect(USDA_NUTRIENT_MAP[1178]).toBe('vitaminB12');
    expect(USDA_NUTRIENT_MAP[1162]).toBe('vitaminC');
    expect(USDA_NUTRIENT_MAP[1095]).toBe('zinc');
    expect(USDA_NUTRIENT_MAP[1090]).toBe('magnesium');
    expect(USDA_NUTRIENT_MAP[1177]).toBe('folate');
    expect(USDA_NUTRIENT_MAP[1092]).toBe('potassium');
  });

  it('maps multiple omega-3 USDA IDs to omega3', () => {
    expect(USDA_NUTRIENT_MAP[1404]).toBe('omega3');
    expect(USDA_NUTRIENT_MAP[1278]).toBe('omega3');
    expect(USDA_NUTRIENT_MAP[1272]).toBe('omega3');
  });
});

describe('extractNutrientsFromSearch', () => {
  it('extracts supported nutrients from USDA search format', () => {
    const usdaNutrients = [
      { nutrientId: 1089, value: 2.5 },  // iron
      { nutrientId: 1087, value: 120 },   // calcium
      { nutrientId: 9999, value: 50 },    // unknown — should be ignored
    ];

    const result = extractNutrientsFromSearch(usdaNutrients);

    expect(result).toHaveLength(2);
    expect(result).toContainEqual({ nutrientId: 'iron', amount: 2.5 });
    expect(result).toContainEqual({ nutrientId: 'calcium', amount: 120 });
  });

  it('sums omega-3 fatty acid components', () => {
    const usdaNutrients = [
      { nutrientId: 1404, value: 0.5 },  // ALA
      { nutrientId: 1278, value: 0.3 },  // EPA
      { nutrientId: 1272, value: 0.2 },  // DHA
    ];

    const result = extractNutrientsFromSearch(usdaNutrients);

    expect(result).toHaveLength(1);
    expect(result[0]).toEqual({ nutrientId: 'omega3', amount: 1 });
  });

  it('rounds nutrient amounts to 2 decimal places', () => {
    const usdaNutrients = [
      { nutrientId: 1089, value: 1.123456 },
    ];

    const result = extractNutrientsFromSearch(usdaNutrients);
    expect(result[0].amount).toBe(1.12);
  });

  it('returns empty array when no supported nutrients present', () => {
    const usdaNutrients = [
      { nutrientId: 9999, value: 50 },
    ];

    const result = extractNutrientsFromSearch(usdaNutrients);
    expect(result).toEqual([]);
  });
});

describe('extractNutrientsFromDetail', () => {
  it('extracts nutrients from USDA detail format using nutrient.id', () => {
    const foodNutrients = [
      { nutrient: { id: 1089, name: 'Iron' }, amount: 3.5 },
      { nutrient: { id: 1162, name: 'Vitamin C' }, amount: 45 },
    ];

    const result = extractNutrientsFromDetail(foodNutrients);

    expect(result).toHaveLength(2);
    expect(result).toContainEqual({ nutrientId: 'iron', amount: 3.5 });
    expect(result).toContainEqual({ nutrientId: 'vitaminC', amount: 45 });
  });

  it('falls back to nutrientId field when nutrient.id is absent', () => {
    const foodNutrients = [
      { nutrientId: 1095, amount: 1.2 },
    ];

    const result = extractNutrientsFromDetail(foodNutrients);
    expect(result).toContainEqual({ nutrientId: 'zinc', amount: 1.2 });
  });

  it('uses value field when amount is absent', () => {
    const foodNutrients = [
      { nutrient: { id: 1090 }, value: 100 },
    ];

    const result = extractNutrientsFromDetail(foodNutrients);
    expect(result).toContainEqual({ nutrientId: 'magnesium', amount: 100 });
  });
});

describe('searchFoods', () => {
  it('returns mapped food search results from USDA API', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        foods: [
          {
            fdcId: 12345,
            description: 'Chicken breast, raw',
            brandOwner: undefined,
            foodNutrients: [
              { nutrientId: 1089, value: 0.7 },
              { nutrientId: 1087, value: 11 },
            ],
          },
          {
            fdcId: 67890,
            description: 'Salmon, Atlantic',
            brandOwner: 'BrandX',
            foodNutrients: [
              { nutrientId: 1272, value: 1.1 },
              { nutrientId: 1278, value: 0.4 },
            ],
          },
        ],
      }),
    });

    const results = await searchFoods('chicken');

    expect(results).toHaveLength(2);
    expect(results[0]).toEqual({
      fdcId: '12345',
      description: 'Chicken breast, raw',
      brandOwner: undefined,
      nutrients: [
        { nutrientId: 'iron', amount: 0.7 },
        { nutrientId: 'calcium', amount: 11 },
      ],
    });
    expect(results[1].fdcId).toBe('67890');
    expect(results[1].brandOwner).toBe('BrandX');
    expect(results[1].nutrients).toContainEqual({ nutrientId: 'omega3', amount: 1.5 });

    expect(mockFetch).toHaveBeenCalledWith(
      expect.stringContaining('foods/search?query=chicken&api_key=test-api-key')
    );
  });

  it('returns empty array when API key is not set', async () => {
    delete process.env.USDA_API_KEY;

    const results = await searchFoods('chicken');

    expect(results).toEqual([]);
    expect(mockFetch).not.toHaveBeenCalled();
    expect(mockLogger.warn).toHaveBeenCalledWith(
      expect.stringContaining('USDA_API_KEY not configured')
    );
  });

  it('returns empty array on HTTP error', async () => {
    mockFetch.mockResolvedValueOnce({ ok: false, status: 500 });

    const results = await searchFoods('chicken');

    expect(results).toEqual([]);
    expect(mockLogger.error).toHaveBeenCalledWith(
      { status: 500, query: 'chicken' },
      'USDA food search API error'
    );
  });

  it('returns empty array on network error', async () => {
    mockFetch.mockRejectedValueOnce(new Error('Network error'));

    const results = await searchFoods('chicken');

    expect(results).toEqual([]);
    expect(mockLogger.error).toHaveBeenCalledWith(
      { err: expect.any(Error), query: 'chicken' },
      'USDA food search failed'
    );
  });

  it('encodes query parameter', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ foods: [] }),
    });

    await searchFoods('chicken & rice');

    expect(mockFetch).toHaveBeenCalledWith(
      expect.stringContaining('query=chicken%20%26%20rice')
    );
  });

  it('handles missing foods array in response', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({}),
    });

    const results = await searchFoods('test');
    expect(results).toEqual([]);
  });
});

describe('getFoodDetails', () => {
  it('returns detailed food data with nutrients', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        fdcId: 12345,
        description: 'Chicken breast, raw',
        brandOwner: 'FarmFresh',
        foodNutrients: [
          { nutrient: { id: 1089 }, amount: 0.7 },
          { nutrient: { id: 1162 }, amount: 0 },
          { nutrient: { id: 1087 }, amount: 11 },
        ],
      }),
    });

    const result = await getFoodDetails('12345');

    expect(result).toEqual({
      fdcId: '12345',
      description: 'Chicken breast, raw',
      brandOwner: 'FarmFresh',
      nutrients: expect.arrayContaining([
        { nutrientId: 'iron', amount: 0.7 },
        { nutrientId: 'vitaminC', amount: 0 },
        { nutrientId: 'calcium', amount: 11 },
      ]),
    });

    expect(mockFetch).toHaveBeenCalledWith(
      expect.stringContaining('food/12345?api_key=test-api-key')
    );
  });

  it('returns null when API key is not set', async () => {
    delete process.env.USDA_API_KEY;

    const result = await getFoodDetails('12345');

    expect(result).toBeNull();
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it('returns null on HTTP error', async () => {
    mockFetch.mockResolvedValueOnce({ ok: false, status: 404 });

    const result = await getFoodDetails('12345');

    expect(result).toBeNull();
    expect(mockLogger.error).toHaveBeenCalledWith(
      { status: 404, fdcId: '12345' },
      'USDA food detail API error'
    );
  });

  it('returns null on network error', async () => {
    mockFetch.mockRejectedValueOnce(new Error('timeout'));

    const result = await getFoodDetails('12345');

    expect(result).toBeNull();
    expect(mockLogger.error).toHaveBeenCalledWith(
      { err: expect.any(Error), fdcId: '12345' },
      'USDA food detail fetch failed'
    );
  });
});
