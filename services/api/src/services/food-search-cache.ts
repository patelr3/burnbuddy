import { logger } from '../lib/logger';
import { getDb } from '../lib/firestore';
import { searchFoods, getFoodDetails } from './usda-food-search';
import type { FoodSearchResult } from '@burnbuddy/shared';

const COLLECTION = 'foodCache';
const CACHE_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 days

interface CacheDocument {
  query?: string;
  fdcId?: string;
  results: FoodSearchResult[];
  cachedAt: string;
}

/**
 * Normalizes a search query for use as a cache key.
 * Lowercase, trimmed, with excess whitespace collapsed.
 */
function normalizeCacheKey(query: string): string {
  return query.toLowerCase().trim().replace(/\s+/g, ' ');
}

/**
 * Returns true if the cache entry is still valid (< 30 days old).
 */
function isCacheValid(cachedAt: string): boolean {
  const cachedTime = new Date(cachedAt).getTime();
  if (isNaN(cachedTime)) return false;
  return Date.now() - cachedTime < CACHE_TTL_MS;
}

/**
 * Searches for foods with Firestore caching.
 * Checks cache first; on miss, calls USDA API and stores the result.
 */
export async function cachedSearchFoods(query: string): Promise<FoodSearchResult[]> {
  const cacheKey = normalizeCacheKey(query);
  if (!cacheKey) return searchFoods(query);

  try {
    const db = getDb();
    const docRef = db.collection(COLLECTION).doc(cacheKey);
    const doc = await docRef.get();

    if (doc.exists) {
      const data = doc.data() as CacheDocument;
      if (isCacheValid(data.cachedAt)) {
        logger.debug({ query: cacheKey }, 'Food search cache hit');
        return data.results;
      }
      logger.debug({ query: cacheKey }, 'Food search cache expired');
    }
  } catch (err) {
    logger.warn({ err, query: cacheKey }, 'Food search cache read failed, falling back to USDA API');
  }

  const results = await searchFoods(query);

  // Only cache non-empty results
  if (results.length > 0) {
    try {
      const db = getDb();
      const docRef = db.collection(COLLECTION).doc(cacheKey);
      const cacheDoc: CacheDocument = {
        query: cacheKey,
        results,
        cachedAt: new Date().toISOString(),
      };
      await docRef.set(cacheDoc);
      logger.debug({ query: cacheKey }, 'Food search results cached');
    } catch (err) {
      logger.warn({ err, query: cacheKey }, 'Food search cache write failed');
    }
  }

  return results;
}

/**
 * Gets food details with Firestore caching.
 * Checks cache first; on miss, calls USDA API and stores the result.
 */
export async function cachedGetFoodDetails(fdcId: string): Promise<FoodSearchResult | null> {
  const cacheKey = `fdc_${fdcId}`;

  try {
    const db = getDb();
    const docRef = db.collection(COLLECTION).doc(cacheKey);
    const doc = await docRef.get();

    if (doc.exists) {
      const data = doc.data() as CacheDocument;
      if (isCacheValid(data.cachedAt)) {
        logger.debug({ fdcId }, 'Food detail cache hit');
        return data.results[0] ?? null;
      }
      logger.debug({ fdcId }, 'Food detail cache expired');
    }
  } catch (err) {
    logger.warn({ err, fdcId }, 'Food detail cache read failed, falling back to USDA API');
  }

  const result = await getFoodDetails(fdcId);

  if (result) {
    try {
      const db = getDb();
      const docRef = db.collection(COLLECTION).doc(cacheKey);
      const cacheDoc: CacheDocument = {
        fdcId,
        results: [result],
        cachedAt: new Date().toISOString(),
      };
      await docRef.set(cacheDoc);
      logger.debug({ fdcId }, 'Food detail result cached');
    } catch (err) {
      logger.warn({ err, fdcId }, 'Food detail cache write failed');
    }
  }

  return result;
}

/** Exported for testing */
export { normalizeCacheKey, isCacheValid, CACHE_TTL_MS };
