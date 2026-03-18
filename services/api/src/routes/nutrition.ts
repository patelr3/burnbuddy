import { Router, type Request, type Response } from 'express';
import { randomUUID } from 'crypto';
import { requireAuth } from '../middleware/auth';
import { getDb } from '../lib/firestore';
import { logger } from '../lib/logger';
import { cachedSearchFoods } from '../services/food-search-cache';
import { evaluateNutritionPoints } from '../services/nutrition-points';
import type { Recipe, MealEntry, SupplementEntry, NutrientAmount, NutritionGoals, NutrientId, DailyNutritionSummary } from '@burnbuddy/shared';
import { SUPPORTED_NUTRIENTS, SUPPORTED_UNITS } from '@burnbuddy/shared';

const router = Router();

/**
 * Calculate total nutrients per serving from ingredients.
 * Sums all ingredient nutrients and divides by number of servings.
 */
function calculateNutrientsPerServing(
  ingredients: Recipe['ingredients'],
  servings: number,
): NutrientAmount[] {
  const nutrientMap = new Map<string, number>();

  for (const ingredient of ingredients) {
    for (const n of ingredient.nutrients) {
      nutrientMap.set(n.nutrientId, (nutrientMap.get(n.nutrientId) ?? 0) + n.amount);
    }
  }

  return Array.from(nutrientMap.entries()).map(([nutrientId, amount]) => ({
    nutrientId: nutrientId as NutrientAmount['nutrientId'],
    amount: amount / servings,
  }));
}

// POST /nutrition/recipes — Create a recipe
router.post('/recipes', requireAuth, async (req: Request, res: Response): Promise<void> => {
  const uid = req.user!.uid;
  const { name, description, ingredients, directNutrients, servings } = req.body as {
    name?: string;
    description?: string;
    ingredients?: Recipe['ingredients'];
    directNutrients?: NutrientAmount[];
    servings?: number;
  };

  if (!name || typeof name !== 'string' || name.trim().length === 0) {
    res.status(400).json({ error: 'name is required' });
    return;
  }

  if (servings === undefined || servings === null || typeof servings !== 'number' || servings <= 0) {
    res.status(400).json({ error: 'servings must be a positive number' });
    return;
  }

  if (ingredients && Array.isArray(ingredients)) {
    const invalidUnit = ingredients.find(
      (i) => i.unit && !(SUPPORTED_UNITS as readonly string[]).includes(i.unit),
    );
    if (invalidUnit) {
      res.status(400).json({ error: `Invalid unit '${invalidUnit.unit}'. Supported units: ${SUPPORTED_UNITS.join(', ')}` });
      return;
    }
  }

  const now = new Date().toISOString();
  const id = randomUUID();

  const recipe: Recipe = {
    id,
    uid,
    name: name.trim(),
    description: description?.trim(),
    ingredients: ingredients ?? [],
    directNutrients,
    servings,
    createdAt: now,
    updatedAt: now,
  };

  const db = getDb();
  await db.collection('recipes').doc(id).set(recipe);

  res.status(201).json(recipe);
});

// GET /nutrition/recipes — List all recipes for the authenticated user
router.get('/recipes', requireAuth, async (req: Request, res: Response): Promise<void> => {
  const uid = req.user!.uid;
  const db = getDb();

  const snapshot = await db
    .collection('recipes')
    .where('uid', '==', uid)
    .orderBy('updatedAt', 'desc')
    .get();

  const recipes = snapshot.docs.map((doc) => doc.data() as Recipe);
  res.json(recipes);
});

// GET /nutrition/recipes/:id — Get a single recipe by ID
router.get('/recipes/:id', requireAuth, async (req: Request, res: Response): Promise<void> => {
  const uid = req.user!.uid;
  const id = req.params['id'] as string;
  const db = getDb();

  const doc = await db.collection('recipes').doc(id).get();

  if (!doc.exists) {
    res.status(404).json({ error: 'Recipe not found' });
    return;
  }

  const recipe = doc.data() as Recipe;

  if (recipe.uid !== uid) {
    res.status(404).json({ error: 'Recipe not found' });
    return;
  }

  // Resolve nutrients: directNutrients take precedence
  const nutrientsPerServing =
    recipe.directNutrients ??
    (recipe.ingredients.length > 0
      ? calculateNutrientsPerServing(recipe.ingredients, recipe.servings)
      : []);

  res.json({ ...recipe, nutrientsPerServing });
});

// PUT /nutrition/recipes/:id — Update a recipe
router.put('/recipes/:id', requireAuth, async (req: Request, res: Response): Promise<void> => {
  const uid = req.user!.uid;
  const id = req.params['id'] as string;
  const db = getDb();

  const doc = await db.collection('recipes').doc(id).get();

  if (!doc.exists) {
    res.status(404).json({ error: 'Recipe not found' });
    return;
  }

  const existing = doc.data() as Recipe;

  if (existing.uid !== uid) {
    res.status(404).json({ error: 'Recipe not found' });
    return;
  }

  const { name, description, ingredients, directNutrients, servings } = req.body as {
    name?: string;
    description?: string;
    ingredients?: Recipe['ingredients'];
    directNutrients?: NutrientAmount[];
    servings?: number;
  };

  if (name !== undefined && (typeof name !== 'string' || name.trim().length === 0)) {
    res.status(400).json({ error: 'name must be a non-empty string' });
    return;
  }

  if (servings !== undefined && (typeof servings !== 'number' || servings <= 0)) {
    res.status(400).json({ error: 'servings must be a positive number' });
    return;
  }

  if (ingredients && Array.isArray(ingredients)) {
    const invalidUnit = ingredients.find(
      (i) => i.unit && !(SUPPORTED_UNITS as readonly string[]).includes(i.unit),
    );
    if (invalidUnit) {
      res.status(400).json({ error: `Invalid unit '${invalidUnit.unit}'. Supported units: ${SUPPORTED_UNITS.join(', ')}` });
      return;
    }
  }

  const updatedRecipe: Recipe = {
    ...existing,
    name: name !== undefined ? name.trim() : existing.name,
    description: description !== undefined ? description?.trim() : existing.description,
    ingredients: ingredients !== undefined ? ingredients : existing.ingredients,
    directNutrients: directNutrients !== undefined ? directNutrients : existing.directNutrients,
    servings: servings !== undefined ? servings : existing.servings,
    updatedAt: new Date().toISOString(),
  };

  await db.collection('recipes').doc(id).set(updatedRecipe);

  res.json(updatedRecipe);
});

// DELETE /nutrition/recipes/:id — Delete a recipe
router.delete('/recipes/:id', requireAuth, async (req: Request, res: Response): Promise<void> => {
  const uid = req.user!.uid;
  const id = req.params['id'] as string;
  const db = getDb();

  const doc = await db.collection('recipes').doc(id).get();

  if (!doc.exists) {
    res.status(404).json({ error: 'Recipe not found' });
    return;
  }

  const recipe = doc.data() as Recipe;

  if (recipe.uid !== uid) {
    res.status(404).json({ error: 'Recipe not found' });
    return;
  }

  await db.collection('recipes').doc(id).delete();

  res.status(204).send();
});

// ── Meal logging routes ──────────────────────────────────────────

/**
 * Resolve nutrients for a meal entry.
 * If recipeId is given, fetch the recipe and scale nutrients by servingsConsumed / recipe.servings.
 * Otherwise use directly provided nutrients.
 */
async function resolveMealNutrients(
  uid: string,
  recipeId: string | undefined,
  directNutrients: NutrientAmount[] | undefined,
  servingsConsumed: number,
): Promise<NutrientAmount[]> {
  if (!recipeId) {
    return directNutrients ?? [];
  }

  const db = getDb();
  const doc = await db.collection('recipes').doc(recipeId).get();

  if (!doc.exists) {
    return directNutrients ?? [];
  }

  const recipe = doc.data() as Recipe;
  if (recipe.uid !== uid) {
    return directNutrients ?? [];
  }

  // Resolve per-serving nutrients from recipe
  const perServing =
    recipe.directNutrients ??
    (recipe.ingredients.length > 0
      ? calculateNutrientsPerServing(recipe.ingredients, recipe.servings)
      : []);

  // Scale by servings consumed
  return perServing.map((n) => ({
    nutrientId: n.nutrientId,
    amount: n.amount * servingsConsumed,
  }));
}

// POST /nutrition/meals — Log a meal
router.post('/meals', requireAuth, async (req: Request, res: Response): Promise<void> => {
  const uid = req.user!.uid;
  const { date, mealType, recipeId, recipeName, servingsConsumed, nutrients } = req.body as {
    date?: string;
    mealType?: string;
    recipeId?: string;
    recipeName?: string;
    servingsConsumed?: number;
    nutrients?: NutrientAmount[];
  };

  if (!date || typeof date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    res.status(400).json({ error: 'date is required in YYYY-MM-DD format' });
    return;
  }

  const validMealTypes = ['breakfast', 'lunch', 'dinner', 'snack'];
  if (!mealType || !validMealTypes.includes(mealType)) {
    res.status(400).json({ error: 'mealType must be one of: breakfast, lunch, dinner, snack' });
    return;
  }

  if (!recipeName || typeof recipeName !== 'string' || recipeName.trim().length === 0) {
    res.status(400).json({ error: 'recipeName is required' });
    return;
  }

  if (
    servingsConsumed === undefined ||
    servingsConsumed === null ||
    typeof servingsConsumed !== 'number' ||
    servingsConsumed <= 0
  ) {
    res.status(400).json({ error: 'servingsConsumed must be a positive number' });
    return;
  }

  const resolvedNutrients = await resolveMealNutrients(uid, recipeId, nutrients, servingsConsumed);

  const id = randomUUID();
  const meal: MealEntry = {
    id,
    uid,
    date,
    mealType: mealType as MealEntry['mealType'],
    recipeId,
    recipeName: recipeName.trim(),
    servingsConsumed,
    nutrients: resolvedNutrients,
    createdAt: new Date().toISOString(),
  };

  const db = getDb();
  await db.collection('mealEntries').doc(id).set(meal);

  // Fire-and-forget: evaluate nutrition points
  evaluateNutritionPoints(uid, date).catch((err: unknown) => {
    logger.error({ err, uid, date }, 'Nutrition points evaluation failed after meal log');
  });

  res.status(201).json(meal);
});

// GET /nutrition/meals?date=YYYY-MM-DD — Get meals for a date
router.get('/meals', requireAuth, async (req: Request, res: Response): Promise<void> => {
  const uid = req.user!.uid;
  let date = req.query['date'] as string | undefined;

  if (!date) {
    date = new Date().toISOString().split('T')[0]!;
  }

  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    res.status(400).json({ error: 'date must be in YYYY-MM-DD format' });
    return;
  }

  const db = getDb();
  const snapshot = await db
    .collection('mealEntries')
    .where('uid', '==', uid)
    .where('date', '==', date)
    .orderBy('createdAt', 'asc')
    .get();

  const meals = snapshot.docs.map((doc) => doc.data() as MealEntry);
  res.json(meals);
});

// DELETE /nutrition/meals/:id — Delete a meal entry
router.delete('/meals/:id', requireAuth, async (req: Request, res: Response): Promise<void> => {
  const uid = req.user!.uid;
  const id = req.params['id'] as string;
  const db = getDb();

  const doc = await db.collection('mealEntries').doc(id).get();

  if (!doc.exists) {
    res.status(404).json({ error: 'Meal entry not found' });
    return;
  }

  const meal = doc.data() as MealEntry;

  if (meal.uid !== uid) {
    res.status(404).json({ error: 'Meal entry not found' });
    return;
  }

  await db.collection('mealEntries').doc(id).delete();

  // Fire-and-forget: re-evaluate nutrition points
  evaluateNutritionPoints(uid, meal.date).catch((err: unknown) => {
    logger.error({ err, uid, date: meal.date }, 'Nutrition points evaluation failed after meal delete');
  });

  res.status(204).send();
});

// ── Supplement logging routes ──────────────────────────────────────

// POST /nutrition/supplements — Log a supplement entry
router.post('/supplements', requireAuth, async (req: Request, res: Response): Promise<void> => {
  const uid = req.user!.uid;
  const { date, supplementName, nutrients } = req.body as {
    date?: string;
    supplementName?: string;
    nutrients?: NutrientAmount[];
  };

  if (!date || typeof date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    res.status(400).json({ error: 'date is required in YYYY-MM-DD format' });
    return;
  }

  if (!supplementName || typeof supplementName !== 'string' || supplementName.trim().length === 0) {
    res.status(400).json({ error: 'supplementName is required' });
    return;
  }

  if (!Array.isArray(nutrients) || nutrients.length === 0) {
    res.status(400).json({ error: 'nutrients must be a non-empty array' });
    return;
  }

  const id = randomUUID();
  const entry: SupplementEntry = {
    id,
    uid,
    date,
    supplementName: supplementName.trim(),
    nutrients,
    createdAt: new Date().toISOString(),
  };

  const db = getDb();
  await db.collection('supplementEntries').doc(id).set(entry);

  // Fire-and-forget: evaluate nutrition points
  evaluateNutritionPoints(uid, date).catch((err: unknown) => {
    logger.error({ err, uid, date }, 'Nutrition points evaluation failed after supplement log');
  });

  res.status(201).json(entry);
});

// GET /nutrition/supplements?date=YYYY-MM-DD — Get supplement entries for a date
router.get('/supplements', requireAuth, async (req: Request, res: Response): Promise<void> => {
  const uid = req.user!.uid;
  let date = req.query['date'] as string | undefined;

  if (!date) {
    date = new Date().toISOString().split('T')[0]!;
  }

  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    res.status(400).json({ error: 'date must be in YYYY-MM-DD format' });
    return;
  }

  const db = getDb();
  const snapshot = await db
    .collection('supplementEntries')
    .where('uid', '==', uid)
    .where('date', '==', date)
    .orderBy('createdAt', 'asc')
    .get();

  const supplements = snapshot.docs.map((doc) => doc.data() as SupplementEntry);
  res.json(supplements);
});

// DELETE /nutrition/supplements/:id — Delete a supplement entry
router.delete('/supplements/:id', requireAuth, async (req: Request, res: Response): Promise<void> => {
  const uid = req.user!.uid;
  const id = req.params['id'] as string;
  const db = getDb();

  const doc = await db.collection('supplementEntries').doc(id).get();

  if (!doc.exists) {
    res.status(404).json({ error: 'Supplement entry not found' });
    return;
  }

  const entry = doc.data() as SupplementEntry;

  if (entry.uid !== uid) {
    res.status(404).json({ error: 'Supplement entry not found' });
    return;
  }

  await db.collection('supplementEntries').doc(id).delete();

  // Fire-and-forget: re-evaluate nutrition points
  evaluateNutritionPoints(uid, entry.date).catch((err: unknown) => {
    logger.error({ err, uid, date: entry.date }, 'Nutrition points evaluation failed after supplement delete');
  });

  res.status(204).send();
});

// ── Goals routes ──────────────────────────────────────────────────

// GET /nutrition/goals — Get the user's nutrition goals
router.get('/goals', requireAuth, async (req: Request, res: Response): Promise<void> => {
  const uid = req.user!.uid;
  const db = getDb();

  const doc = await db.collection('nutritionGoals').doc(uid).get();

  if (!doc.exists) {
    const defaults: NutritionGoals = {
      uid,
      targetNutrients: [],
      updatedAt: new Date().toISOString(),
    };
    res.json(defaults);
    return;
  }

  res.json(doc.data() as NutritionGoals);
});

// PUT /nutrition/goals — Set/update target nutrients
router.put('/goals', requireAuth, async (req: Request, res: Response): Promise<void> => {
  const uid = req.user!.uid;
  const { targetNutrients } = req.body as { targetNutrients?: unknown };

  if (!Array.isArray(targetNutrients)) {
    res.status(400).json({ error: 'targetNutrients must be an array' });
    return;
  }

  if (targetNutrients.length > 3) {
    res.status(400).json({ error: 'Maximum 3 target nutrients allowed' });
    return;
  }

  const validIds = new Set(SUPPORTED_NUTRIENTS.map((n) => n.id));
  for (const id of targetNutrients) {
    if (typeof id !== 'string' || !validIds.has(id as NutrientId)) {
      res.status(400).json({ error: `Invalid nutrient ID: ${id}` });
      return;
    }
  }

  const goals: NutritionGoals = {
    uid,
    targetNutrients: targetNutrients as NutrientId[],
    updatedAt: new Date().toISOString(),
  };

  const db = getDb();
  await db.collection('nutritionGoals').doc(uid).set(goals);

  res.json(goals);
});

// ── Summary route ─────────────────────────────────────────────────

// GET /nutrition/summary?date=YYYY-MM-DD — Daily nutrition summary
router.get('/summary', requireAuth, async (req: Request, res: Response): Promise<void> => {
  const uid = req.user!.uid;
  let date = req.query['date'] as string | undefined;

  if (!date) {
    date = new Date().toISOString().split('T')[0]!;
  }

  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    res.status(400).json({ error: 'date must be in YYYY-MM-DD format' });
    return;
  }

  const db = getDb();

  // Fetch all meals for this date
  const mealsSnap = await db
    .collection('mealEntries')
    .where('uid', '==', uid)
    .where('date', '==', date)
    .get();

  const meals = mealsSnap.docs.map((doc) => doc.data() as MealEntry);

  // Fetch all supplement entries for this date
  const supplementsSnap = await db
    .collection('supplementEntries')
    .where('uid', '==', uid)
    .where('date', '==', date)
    .get();

  const supplements = supplementsSnap.docs.map((doc) => doc.data() as SupplementEntry);

  // Sum consumed amounts per nutrient (meals + supplements)
  const consumedMap = new Map<NutrientId, number>();
  for (const meal of meals) {
    for (const n of meal.nutrients) {
      consumedMap.set(n.nutrientId, (consumedMap.get(n.nutrientId) ?? 0) + n.amount);
    }
  }
  for (const supp of supplements) {
    for (const n of supp.nutrients) {
      consumedMap.set(n.nutrientId, (consumedMap.get(n.nutrientId) ?? 0) + n.amount);
    }
  }

  // Build summary for all supported nutrients
  const nutrients = SUPPORTED_NUTRIENTS.map((info) => {
    const consumed = consumedMap.get(info.id) ?? 0;
    const recommended = info.dailyRecommended;
    return {
      nutrientId: info.id,
      consumed,
      recommended,
      percentComplete: recommended > 0 ? Math.round((consumed / recommended) * 100) : 0,
    };
  });

  // Count points earned for this date
  const pointsSnap = await db
    .collection('nutritionPoints')
    .where('uid', '==', uid)
    .where('date', '==', date)
    .get();

  const pointsEarned = pointsSnap.docs.length;

  const summary: DailyNutritionSummary = {
    date,
    nutrients,
    pointsEarned,
  };

  res.json(summary);
});

// ── Food search route ─────────────────────────────────────────────

// GET /nutrition/foods/search?q=... — Search foods via USDA
router.get('/foods/search', requireAuth, async (req: Request, res: Response): Promise<void> => {
  const q = req.query['q'] as string | undefined;

  if (!q || typeof q !== 'string' || q.trim().length === 0) {
    res.status(400).json({ error: 'q query parameter is required' });
    return;
  }

  const results = await cachedSearchFoods(q.trim());
  res.json(results);
});

export { calculateNutrientsPerServing };
export default router;
