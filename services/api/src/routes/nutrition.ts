import { Router, type Request, type Response } from 'express';
import { randomUUID } from 'crypto';
import { requireAuth } from '../middleware/auth';
import { getDb } from '../lib/firestore';
import type { Recipe, NutrientAmount } from '@burnbuddy/shared';

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

export { calculateNutrientsPerServing };
export default router;
