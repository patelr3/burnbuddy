import { logger } from '../lib/logger';
import type { FoodSearchResult, NutrientAmount, NutrientId } from '@burnbuddy/shared';
import { SUPPORTED_NUTRIENTS } from '@burnbuddy/shared';

const USDA_BASE_URL = 'https://api.nal.usda.gov/fdc/v1';

/**
 * Maps USDA numeric nutrient IDs to our NutrientId strings.
 * Sources: USDA FoodData Central nutrient number reference.
 */
const USDA_NUTRIENT_MAP: Record<number, NutrientId> = {
  1089: 'iron',
  1114: 'vitaminD',
  1087: 'calcium',
  1178: 'vitaminB12',
  1162: 'vitaminC',
  1095: 'zinc',
  1090: 'magnesium',
  1177: 'folate',
  1092: 'potassium',
  // Omega-3: sum of ALA (1404) + EPA (1278) + DHA (1272)
  1404: 'omega3',
  1278: 'omega3',
  1272: 'omega3',
};

const supportedNutrientIds = new Set<string>(SUPPORTED_NUTRIENTS.map((n) => n.id));

function getApiKey(): string {
  return process.env.USDA_API_KEY ?? '';
}

interface UsdaNutrient {
  nutrientId: number;
  nutrientName?: string;
  value: number;
  unitName?: string;
}

interface UsdaFoodNutrient {
  nutrientId?: number;
  nutrientNumber?: string;
  nutrient?: { id: number; name?: string };
  amount?: number;
  value?: number;
  unitName?: string;
}

interface UsdaSearchFood {
  fdcId: number;
  description: string;
  brandOwner?: string;
  foodNutrients?: UsdaNutrient[];
}

interface UsdaFoodDetail {
  fdcId: number;
  description: string;
  brandOwner?: string;
  foodNutrients?: UsdaFoodNutrient[];
}

/**
 * Extracts nutrients from USDA search result format.
 * Search results have nutrients with { nutrientId, value }.
 */
function extractNutrientsFromSearch(foodNutrients: UsdaNutrient[]): NutrientAmount[] {
  const nutrientTotals = new Map<NutrientId, number>();

  for (const fn of foodNutrients) {
    const nutrientId = USDA_NUTRIENT_MAP[fn.nutrientId];
    if (!nutrientId || !supportedNutrientIds.has(nutrientId)) continue;

    const current = nutrientTotals.get(nutrientId) ?? 0;
    nutrientTotals.set(nutrientId, current + (fn.value ?? 0));
  }

  return Array.from(nutrientTotals.entries()).map(([nutrientId, amount]) => ({
    nutrientId,
    amount: Math.round(amount * 100) / 100,
  }));
}

/**
 * Extracts nutrients from USDA food detail format.
 * Detail results have nutrients with { nutrient: { id }, amount }.
 */
function extractNutrientsFromDetail(foodNutrients: UsdaFoodNutrient[]): NutrientAmount[] {
  const nutrientTotals = new Map<NutrientId, number>();

  for (const fn of foodNutrients) {
    const usdaId = fn.nutrient?.id ?? fn.nutrientId;
    if (usdaId == null) continue;

    const nutrientId = USDA_NUTRIENT_MAP[usdaId];
    if (!nutrientId || !supportedNutrientIds.has(nutrientId)) continue;

    const value = fn.amount ?? fn.value ?? 0;
    const current = nutrientTotals.get(nutrientId) ?? 0;
    nutrientTotals.set(nutrientId, current + value);
  }

  return Array.from(nutrientTotals.entries()).map(([nutrientId, amount]) => ({
    nutrientId,
    amount: Math.round(amount * 100) / 100,
  }));
}

/**
 * Searches USDA FoodData Central for foods matching the query.
 * Returns empty array on error.
 */
export async function searchFoods(query: string): Promise<FoodSearchResult[]> {
  const apiKey = getApiKey();
  if (!apiKey) {
    logger.warn('USDA_API_KEY not configured — food search unavailable');
    return [];
  }

  try {
    const url = `${USDA_BASE_URL}/foods/search?query=${encodeURIComponent(query)}&api_key=${apiKey}&pageSize=25`;
    const response = await fetch(url);

    if (!response.ok) {
      logger.error({ status: response.status, query }, 'USDA food search API error');
      return [];
    }

    const data = (await response.json()) as { foods?: UsdaSearchFood[] };
    const foods = data.foods ?? [];

    return foods.map((food) => ({
      fdcId: String(food.fdcId),
      description: food.description,
      brandOwner: food.brandOwner,
      nutrients: extractNutrientsFromSearch(food.foodNutrients ?? []),
    }));
  } catch (err) {
    logger.error({ err, query }, 'USDA food search failed');
    return [];
  }
}

/**
 * Gets detailed nutrient data for a specific food by FDC ID.
 * Returns null on error.
 */
export async function getFoodDetails(fdcId: string): Promise<FoodSearchResult | null> {
  const apiKey = getApiKey();
  if (!apiKey) {
    logger.warn('USDA_API_KEY not configured — food details unavailable');
    return null;
  }

  try {
    const url = `${USDA_BASE_URL}/food/${fdcId}?api_key=${apiKey}`;
    const response = await fetch(url);

    if (!response.ok) {
      logger.error({ status: response.status, fdcId }, 'USDA food detail API error');
      return null;
    }

    const food = (await response.json()) as UsdaFoodDetail;

    return {
      fdcId: String(food.fdcId),
      description: food.description,
      brandOwner: food.brandOwner,
      nutrients: extractNutrientsFromDetail(food.foodNutrients ?? []),
    };
  } catch (err) {
    logger.error({ err, fdcId }, 'USDA food detail fetch failed');
    return null;
  }
}

/** Exported for testing */
export { USDA_NUTRIENT_MAP, extractNutrientsFromSearch, extractNutrientsFromDetail };
