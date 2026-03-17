import { describe, it, expect, vi, beforeEach } from 'vitest';
import express from 'express';
import request from 'supertest';

// ── Hoisted mocks ──────────────────────────────────────────────────
const {
  mockVerifyIdToken,
  mockRecipesDocGet,
  mockRecipesDocSet,
  mockRecipesDocDelete,
  mockRecipesDocRef,
  mockRecipesQueryGet,
  mockRecipesQueryChain,
  mockRecipesCollectionWhere,
  mockMealsDocGet,
  mockMealsDocSet,
  mockMealsDocDelete,
  mockMealsDocRef,
  mockMealsQueryGet,
  mockMealsQueryChain,
  mockMealsCollectionWhere,
} = vi.hoisted(() => {
  const mockVerifyIdToken = vi.fn();
  const mockRecipesDocGet = vi.fn();
  const mockRecipesDocSet = vi.fn();
  const mockRecipesDocDelete = vi.fn();
  const mockRecipesDocRef = vi.fn(() => ({
    get: mockRecipesDocGet,
    set: mockRecipesDocSet,
    delete: mockRecipesDocDelete,
  }));

  const mockRecipesQueryGet = vi.fn();
  const mockRecipesQueryChain = {
    where: vi.fn(),
    orderBy: vi.fn(),
    get: mockRecipesQueryGet,
  };
  const mockRecipesCollectionWhere = vi.fn(() => mockRecipesQueryChain);

  const mockMealsDocGet = vi.fn();
  const mockMealsDocSet = vi.fn();
  const mockMealsDocDelete = vi.fn();
  const mockMealsDocRef = vi.fn(() => ({
    get: mockMealsDocGet,
    set: mockMealsDocSet,
    delete: mockMealsDocDelete,
  }));

  const mockMealsQueryGet = vi.fn();
  const mockMealsQueryChain = {
    where: vi.fn(),
    orderBy: vi.fn(),
    get: mockMealsQueryGet,
  };
  const mockMealsCollectionWhere = vi.fn(() => mockMealsQueryChain);

  return {
    mockVerifyIdToken,
    mockRecipesDocGet,
    mockRecipesDocSet,
    mockRecipesDocDelete,
    mockRecipesDocRef,
    mockRecipesQueryGet,
    mockRecipesQueryChain,
    mockRecipesCollectionWhere,
    mockMealsDocGet,
    mockMealsDocSet,
    mockMealsDocDelete,
    mockMealsDocRef,
    mockMealsQueryGet,
    mockMealsQueryChain,
    mockMealsCollectionWhere,
  };
});

// ── Module mocks ───────────────────────────────────────────────────
vi.mock('../lib/firebase', () => ({
  admin: {
    auth: () => ({ verifyIdToken: mockVerifyIdToken }),
  },
  initFirebase: vi.fn(),
}));

vi.mock('../lib/firestore', () => ({
  getDb: () => ({
    collection: (name: string) => {
      if (name === 'recipes') {
        return {
          doc: mockRecipesDocRef,
          where: mockRecipesCollectionWhere,
        };
      }
      if (name === 'mealEntries') {
        return {
          doc: mockMealsDocRef,
          where: mockMealsCollectionWhere,
        };
      }
      return {};
    },
  }),
}));

vi.mock('../lib/logger', () => ({
  logger: {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}));

// ── Import route AFTER mocks ──────────────────────────────────────
import nutritionRouter, { calculateNutrientsPerServing } from './nutrition';

// ── Helpers ────────────────────────────────────────────────────────
const VALID_TOKEN = 'Bearer valid.token';
const TEST_UID = 'user-abc-123';
const OTHER_UID = 'user-other-456';
const RECIPE_ID = 'recipe-id-001';

function buildApp() {
  const app = express();
  app.use(express.json());
  app.use('/nutrition', nutritionRouter);
  return app;
}

function makeRecipe(overrides: Record<string, unknown> = {}) {
  return {
    id: RECIPE_ID,
    uid: TEST_UID,
    name: 'Chicken Salad',
    description: 'A healthy salad',
    ingredients: [
      {
        id: 'ing-1',
        name: 'Chicken breast',
        quantity: 200,
        unit: 'g',
        nutrients: [
          { nutrientId: 'iron', amount: 2 },
          { nutrientId: 'zinc', amount: 4 },
        ],
      },
      {
        id: 'ing-2',
        name: 'Lettuce',
        quantity: 100,
        unit: 'g',
        nutrients: [
          { nutrientId: 'iron', amount: 1 },
          { nutrientId: 'vitaminC', amount: 10 },
        ],
      },
    ],
    servings: 2,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  };
}

// ── Setup ──────────────────────────────────────────────────────────
beforeEach(() => {
  vi.resetAllMocks();

  mockVerifyIdToken.mockResolvedValue({ uid: TEST_UID });

  // Re-wire recipes query chain after reset
  mockRecipesCollectionWhere.mockReturnValue(mockRecipesQueryChain);
  mockRecipesQueryChain.where.mockReturnThis();
  mockRecipesQueryChain.orderBy.mockReturnThis();

  mockRecipesDocRef.mockImplementation(() => ({
    get: mockRecipesDocGet,
    set: mockRecipesDocSet,
    delete: mockRecipesDocDelete,
  }));

  // Re-wire meals query chain after reset
  mockMealsCollectionWhere.mockReturnValue(mockMealsQueryChain);
  mockMealsQueryChain.where.mockReturnThis();
  mockMealsQueryChain.orderBy.mockReturnThis();

  mockMealsDocRef.mockImplementation(() => ({
    get: mockMealsDocGet,
    set: mockMealsDocSet,
    delete: mockMealsDocDelete,
  }));
});

// ── Tests ──────────────────────────────────────────────────────────

describe('calculateNutrientsPerServing', () => {
  it('sums ingredient nutrients and divides by servings', () => {
    const ingredients = [
      {
        id: '1',
        name: 'A',
        quantity: 1,
        unit: 'g',
        nutrients: [
          { nutrientId: 'iron' as const, amount: 6 },
          { nutrientId: 'zinc' as const, amount: 3 },
        ],
      },
      {
        id: '2',
        name: 'B',
        quantity: 1,
        unit: 'g',
        nutrients: [{ nutrientId: 'iron' as const, amount: 4 }],
      },
    ];

    const result = calculateNutrientsPerServing(ingredients, 2);
    expect(result).toEqual(
      expect.arrayContaining([
        { nutrientId: 'iron', amount: 5 }, // (6+4)/2
        { nutrientId: 'zinc', amount: 1.5 }, // 3/2
      ]),
    );
  });

  it('returns empty array for no ingredients', () => {
    expect(calculateNutrientsPerServing([], 1)).toEqual([]);
  });
});

describe('POST /nutrition/recipes', () => {
  it('returns 401 without auth', async () => {
    const res = await request(buildApp()).post('/nutrition/recipes').send({ name: 'Test', servings: 1 });
    expect(res.status).toBe(401);
  });

  it('returns 400 when name is missing', async () => {
    const res = await request(buildApp())
      .post('/nutrition/recipes')
      .set('Authorization', VALID_TOKEN)
      .send({ servings: 1 });

    expect(res.status).toBe(400);
    expect(res.body).toMatchObject({ error: expect.stringContaining('name') });
  });

  it('returns 400 when name is empty string', async () => {
    const res = await request(buildApp())
      .post('/nutrition/recipes')
      .set('Authorization', VALID_TOKEN)
      .send({ name: '   ', servings: 1 });

    expect(res.status).toBe(400);
    expect(res.body).toMatchObject({ error: expect.stringContaining('name') });
  });

  it('returns 400 when servings is missing', async () => {
    const res = await request(buildApp())
      .post('/nutrition/recipes')
      .set('Authorization', VALID_TOKEN)
      .send({ name: 'Test Recipe' });

    expect(res.status).toBe(400);
    expect(res.body).toMatchObject({ error: expect.stringContaining('servings') });
  });

  it('returns 400 when servings is zero', async () => {
    const res = await request(buildApp())
      .post('/nutrition/recipes')
      .set('Authorization', VALID_TOKEN)
      .send({ name: 'Test Recipe', servings: 0 });

    expect(res.status).toBe(400);
    expect(res.body).toMatchObject({ error: expect.stringContaining('servings') });
  });

  it('returns 400 when servings is negative', async () => {
    const res = await request(buildApp())
      .post('/nutrition/recipes')
      .set('Authorization', VALID_TOKEN)
      .send({ name: 'Test Recipe', servings: -1 });

    expect(res.status).toBe(400);
    expect(res.body).toMatchObject({ error: expect.stringContaining('servings') });
  });

  it('creates a recipe with minimal fields and returns 201', async () => {
    mockRecipesDocSet.mockResolvedValueOnce(undefined);

    const res = await request(buildApp())
      .post('/nutrition/recipes')
      .set('Authorization', VALID_TOKEN)
      .send({ name: 'Simple Recipe', servings: 1 });

    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({
      uid: TEST_UID,
      name: 'Simple Recipe',
      servings: 1,
      ingredients: [],
    });
    expect(res.body.id).toBeDefined();
    expect(res.body.createdAt).toBeDefined();
    expect(res.body.updatedAt).toBeDefined();
    expect(mockRecipesDocSet).toHaveBeenCalledOnce();
  });

  it('creates a recipe with all fields', async () => {
    mockRecipesDocSet.mockResolvedValueOnce(undefined);

    const body = {
      name: 'Full Recipe',
      description: 'With everything',
      ingredients: [
        {
          id: 'ing-1',
          name: 'Chicken',
          quantity: 200,
          unit: 'g',
          nutrients: [{ nutrientId: 'iron', amount: 3 }],
        },
      ],
      directNutrients: [{ nutrientId: 'iron', amount: 5 }],
      servings: 4,
    };

    const res = await request(buildApp())
      .post('/nutrition/recipes')
      .set('Authorization', VALID_TOKEN)
      .send(body);

    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({
      uid: TEST_UID,
      name: 'Full Recipe',
      description: 'With everything',
      servings: 4,
    });
    expect(res.body.directNutrients).toEqual([{ nutrientId: 'iron', amount: 5 }]);
    expect(res.body.ingredients).toHaveLength(1);
  });
});

describe('GET /nutrition/recipes', () => {
  it('returns 401 without auth', async () => {
    const res = await request(buildApp()).get('/nutrition/recipes');
    expect(res.status).toBe(401);
  });

  it('returns empty array when user has no recipes', async () => {
    mockRecipesQueryGet.mockResolvedValueOnce({ docs: [] });

    const res = await request(buildApp())
      .get('/nutrition/recipes')
      .set('Authorization', VALID_TOKEN);

    expect(res.status).toBe(200);
    expect(res.body).toEqual([]);
  });

  it('returns list of user recipes sorted by updatedAt desc', async () => {
    const recipe1 = makeRecipe({ id: 'r1', updatedAt: '2026-01-02T00:00:00.000Z' });
    const recipe2 = makeRecipe({ id: 'r2', updatedAt: '2026-01-01T00:00:00.000Z' });

    mockRecipesQueryGet.mockResolvedValueOnce({
      docs: [{ data: () => recipe1 }, { data: () => recipe2 }],
    });

    const res = await request(buildApp())
      .get('/nutrition/recipes')
      .set('Authorization', VALID_TOKEN);

    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(2);
    expect(res.body[0].id).toBe('r1');
    expect(res.body[1].id).toBe('r2');

    expect(mockRecipesCollectionWhere).toHaveBeenCalledWith('uid', '==', TEST_UID);
    expect(mockRecipesQueryChain.orderBy).toHaveBeenCalledWith('updatedAt', 'desc');
  });
});

describe('GET /nutrition/recipes/:id', () => {
  it('returns 401 without auth', async () => {
    const res = await request(buildApp()).get(`/nutrition/recipes/${RECIPE_ID}`);
    expect(res.status).toBe(401);
  });

  it('returns 404 when recipe does not exist', async () => {
    mockRecipesDocGet.mockResolvedValueOnce({ exists: false });

    const res = await request(buildApp())
      .get(`/nutrition/recipes/${RECIPE_ID}`)
      .set('Authorization', VALID_TOKEN);

    expect(res.status).toBe(404);
    expect(res.body).toMatchObject({ error: 'Recipe not found' });
  });

  it('returns 404 when recipe belongs to another user', async () => {
    mockRecipesDocGet.mockResolvedValueOnce({
      exists: true,
      data: () => makeRecipe({ uid: OTHER_UID }),
    });

    const res = await request(buildApp())
      .get(`/nutrition/recipes/${RECIPE_ID}`)
      .set('Authorization', VALID_TOKEN);

    expect(res.status).toBe(404);
    expect(res.body).toMatchObject({ error: 'Recipe not found' });
  });

  it('returns recipe with calculated nutrientsPerServing from ingredients', async () => {
    mockRecipesDocGet.mockResolvedValueOnce({
      exists: true,
      data: () => makeRecipe(),
    });

    const res = await request(buildApp())
      .get(`/nutrition/recipes/${RECIPE_ID}`)
      .set('Authorization', VALID_TOKEN);

    expect(res.status).toBe(200);
    expect(res.body.id).toBe(RECIPE_ID);
    expect(res.body.nutrientsPerServing).toEqual(
      expect.arrayContaining([
        { nutrientId: 'iron', amount: 1.5 }, // (2+1)/2
        { nutrientId: 'zinc', amount: 2 }, // 4/2
        { nutrientId: 'vitaminC', amount: 5 }, // 10/2
      ]),
    );
  });

  it('returns directNutrients as nutrientsPerServing when present', async () => {
    const directNutrients = [{ nutrientId: 'iron', amount: 99 }];
    mockRecipesDocGet.mockResolvedValueOnce({
      exists: true,
      data: () => makeRecipe({ directNutrients }),
    });

    const res = await request(buildApp())
      .get(`/nutrition/recipes/${RECIPE_ID}`)
      .set('Authorization', VALID_TOKEN);

    expect(res.status).toBe(200);
    expect(res.body.nutrientsPerServing).toEqual(directNutrients);
  });

  it('returns empty nutrientsPerServing when no ingredients and no directNutrients', async () => {
    mockRecipesDocGet.mockResolvedValueOnce({
      exists: true,
      data: () => makeRecipe({ ingredients: [], directNutrients: undefined }),
    });

    const res = await request(buildApp())
      .get(`/nutrition/recipes/${RECIPE_ID}`)
      .set('Authorization', VALID_TOKEN);

    expect(res.status).toBe(200);
    expect(res.body.nutrientsPerServing).toEqual([]);
  });
});

describe('PUT /nutrition/recipes/:id', () => {
  it('returns 401 without auth', async () => {
    const res = await request(buildApp())
      .put(`/nutrition/recipes/${RECIPE_ID}`)
      .send({ name: 'Updated' });

    expect(res.status).toBe(401);
  });

  it('returns 404 when recipe does not exist', async () => {
    mockRecipesDocGet.mockResolvedValueOnce({ exists: false });

    const res = await request(buildApp())
      .put(`/nutrition/recipes/${RECIPE_ID}`)
      .set('Authorization', VALID_TOKEN)
      .send({ name: 'Updated' });

    expect(res.status).toBe(404);
  });

  it('returns 404 when recipe belongs to another user', async () => {
    mockRecipesDocGet.mockResolvedValueOnce({
      exists: true,
      data: () => makeRecipe({ uid: OTHER_UID }),
    });

    const res = await request(buildApp())
      .put(`/nutrition/recipes/${RECIPE_ID}`)
      .set('Authorization', VALID_TOKEN)
      .send({ name: 'Updated' });

    expect(res.status).toBe(404);
  });

  it('returns 400 when name is empty string', async () => {
    mockRecipesDocGet.mockResolvedValueOnce({
      exists: true,
      data: () => makeRecipe(),
    });

    const res = await request(buildApp())
      .put(`/nutrition/recipes/${RECIPE_ID}`)
      .set('Authorization', VALID_TOKEN)
      .send({ name: '' });

    expect(res.status).toBe(400);
    expect(res.body).toMatchObject({ error: expect.stringContaining('name') });
  });

  it('returns 400 when servings is zero', async () => {
    mockRecipesDocGet.mockResolvedValueOnce({
      exists: true,
      data: () => makeRecipe(),
    });

    const res = await request(buildApp())
      .put(`/nutrition/recipes/${RECIPE_ID}`)
      .set('Authorization', VALID_TOKEN)
      .send({ servings: 0 });

    expect(res.status).toBe(400);
    expect(res.body).toMatchObject({ error: expect.stringContaining('servings') });
  });

  it('updates recipe name and returns updated recipe', async () => {
    mockRecipesDocGet.mockResolvedValueOnce({
      exists: true,
      data: () => makeRecipe(),
    });
    mockRecipesDocSet.mockResolvedValueOnce(undefined);

    const res = await request(buildApp())
      .put(`/nutrition/recipes/${RECIPE_ID}`)
      .set('Authorization', VALID_TOKEN)
      .send({ name: 'Updated Salad' });

    expect(res.status).toBe(200);
    expect(res.body.name).toBe('Updated Salad');
    expect(res.body.id).toBe(RECIPE_ID);
    expect(res.body.uid).toBe(TEST_UID);
    expect(mockRecipesDocSet).toHaveBeenCalledOnce();
  });

  it('updates multiple fields at once', async () => {
    mockRecipesDocGet.mockResolvedValueOnce({
      exists: true,
      data: () => makeRecipe(),
    });
    mockRecipesDocSet.mockResolvedValueOnce(undefined);

    const res = await request(buildApp())
      .put(`/nutrition/recipes/${RECIPE_ID}`)
      .set('Authorization', VALID_TOKEN)
      .send({ name: 'New Name', description: 'New desc', servings: 8 });

    expect(res.status).toBe(200);
    expect(res.body.name).toBe('New Name');
    expect(res.body.description).toBe('New desc');
    expect(res.body.servings).toBe(8);
  });

  it('preserves existing fields when not included in update', async () => {
    const existing = makeRecipe();
    mockRecipesDocGet.mockResolvedValueOnce({
      exists: true,
      data: () => existing,
    });
    mockRecipesDocSet.mockResolvedValueOnce(undefined);

    const res = await request(buildApp())
      .put(`/nutrition/recipes/${RECIPE_ID}`)
      .set('Authorization', VALID_TOKEN)
      .send({ name: 'Only Name Updated' });

    expect(res.status).toBe(200);
    expect(res.body.name).toBe('Only Name Updated');
    expect(res.body.description).toBe(existing.description);
    expect(res.body.servings).toBe(existing.servings);
    expect(res.body.ingredients).toEqual(existing.ingredients);
  });

  it('updates updatedAt timestamp', async () => {
    mockRecipesDocGet.mockResolvedValueOnce({
      exists: true,
      data: () => makeRecipe(),
    });
    mockRecipesDocSet.mockResolvedValueOnce(undefined);

    const res = await request(buildApp())
      .put(`/nutrition/recipes/${RECIPE_ID}`)
      .set('Authorization', VALID_TOKEN)
      .send({ name: 'Timestamp Test' });

    expect(res.status).toBe(200);
    expect(res.body.updatedAt).not.toBe('2026-01-01T00:00:00.000Z');
  });
});

describe('DELETE /nutrition/recipes/:id', () => {
  it('returns 401 without auth', async () => {
    const res = await request(buildApp()).delete(`/nutrition/recipes/${RECIPE_ID}`);
    expect(res.status).toBe(401);
  });

  it('returns 404 when recipe does not exist', async () => {
    mockRecipesDocGet.mockResolvedValueOnce({ exists: false });

    const res = await request(buildApp())
      .delete(`/nutrition/recipes/${RECIPE_ID}`)
      .set('Authorization', VALID_TOKEN);

    expect(res.status).toBe(404);
  });

  it('returns 404 when recipe belongs to another user', async () => {
    mockRecipesDocGet.mockResolvedValueOnce({
      exists: true,
      data: () => makeRecipe({ uid: OTHER_UID }),
    });

    const res = await request(buildApp())
      .delete(`/nutrition/recipes/${RECIPE_ID}`)
      .set('Authorization', VALID_TOKEN);

    expect(res.status).toBe(404);
  });

  it('deletes recipe and returns 204', async () => {
    mockRecipesDocGet.mockResolvedValueOnce({
      exists: true,
      data: () => makeRecipe(),
    });
    mockRecipesDocDelete.mockResolvedValueOnce(undefined);

    const res = await request(buildApp())
      .delete(`/nutrition/recipes/${RECIPE_ID}`)
      .set('Authorization', VALID_TOKEN);

    expect(res.status).toBe(204);
    expect(res.body).toEqual({});
    expect(mockRecipesDocDelete).toHaveBeenCalledOnce();
  });
});

// ── Meal logging tests ────────────────────────────────────────────

const MEAL_ID = 'meal-id-001';

function makeMeal(overrides: Record<string, unknown> = {}) {
  return {
    id: MEAL_ID,
    uid: TEST_UID,
    date: '2026-03-15',
    mealType: 'lunch',
    recipeName: 'Chicken Salad',
    servingsConsumed: 1,
    nutrients: [{ nutrientId: 'iron', amount: 1.5 }],
    createdAt: '2026-03-15T12:00:00.000Z',
    ...overrides,
  };
}

describe('POST /nutrition/meals', () => {
  it('returns 401 without auth', async () => {
    const res = await request(buildApp())
      .post('/nutrition/meals')
      .send({ date: '2026-03-15', mealType: 'lunch', recipeName: 'Test', servingsConsumed: 1 });

    expect(res.status).toBe(401);
  });

  it('returns 400 when date is missing', async () => {
    const res = await request(buildApp())
      .post('/nutrition/meals')
      .set('Authorization', VALID_TOKEN)
      .send({ mealType: 'lunch', recipeName: 'Test', servingsConsumed: 1 });

    expect(res.status).toBe(400);
    expect(res.body).toMatchObject({ error: expect.stringContaining('date') });
  });

  it('returns 400 when date format is invalid', async () => {
    const res = await request(buildApp())
      .post('/nutrition/meals')
      .set('Authorization', VALID_TOKEN)
      .send({ date: '03-15-2026', mealType: 'lunch', recipeName: 'Test', servingsConsumed: 1 });

    expect(res.status).toBe(400);
    expect(res.body).toMatchObject({ error: expect.stringContaining('YYYY-MM-DD') });
  });

  it('returns 400 when mealType is invalid', async () => {
    const res = await request(buildApp())
      .post('/nutrition/meals')
      .set('Authorization', VALID_TOKEN)
      .send({ date: '2026-03-15', mealType: 'brunch', recipeName: 'Test', servingsConsumed: 1 });

    expect(res.status).toBe(400);
    expect(res.body).toMatchObject({ error: expect.stringContaining('mealType') });
  });

  it('returns 400 when recipeName is missing', async () => {
    const res = await request(buildApp())
      .post('/nutrition/meals')
      .set('Authorization', VALID_TOKEN)
      .send({ date: '2026-03-15', mealType: 'lunch', servingsConsumed: 1 });

    expect(res.status).toBe(400);
    expect(res.body).toMatchObject({ error: expect.stringContaining('recipeName') });
  });

  it('returns 400 when servingsConsumed is missing', async () => {
    const res = await request(buildApp())
      .post('/nutrition/meals')
      .set('Authorization', VALID_TOKEN)
      .send({ date: '2026-03-15', mealType: 'lunch', recipeName: 'Test' });

    expect(res.status).toBe(400);
    expect(res.body).toMatchObject({ error: expect.stringContaining('servingsConsumed') });
  });

  it('returns 400 when servingsConsumed is zero', async () => {
    const res = await request(buildApp())
      .post('/nutrition/meals')
      .set('Authorization', VALID_TOKEN)
      .send({ date: '2026-03-15', mealType: 'lunch', recipeName: 'Test', servingsConsumed: 0 });

    expect(res.status).toBe(400);
    expect(res.body).toMatchObject({ error: expect.stringContaining('servingsConsumed') });
  });

  it('logs a meal without recipe (direct nutrients) and returns 201', async () => {
    mockMealsDocSet.mockResolvedValueOnce(undefined);

    const body = {
      date: '2026-03-15',
      mealType: 'breakfast',
      recipeName: 'Quick Oats',
      servingsConsumed: 1,
      nutrients: [
        { nutrientId: 'iron', amount: 3 },
        { nutrientId: 'calcium', amount: 50 },
      ],
    };

    const res = await request(buildApp())
      .post('/nutrition/meals')
      .set('Authorization', VALID_TOKEN)
      .send(body);

    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({
      uid: TEST_UID,
      date: '2026-03-15',
      mealType: 'breakfast',
      recipeName: 'Quick Oats',
      servingsConsumed: 1,
    });
    expect(res.body.nutrients).toEqual([
      { nutrientId: 'iron', amount: 3 },
      { nutrientId: 'calcium', amount: 50 },
    ]);
    expect(res.body.id).toBeDefined();
    expect(res.body.createdAt).toBeDefined();
    expect(mockMealsDocSet).toHaveBeenCalledOnce();
  });

  it('logs a meal with recipe and resolves nutrients from recipe', async () => {
    mockMealsDocSet.mockResolvedValueOnce(undefined);

    // Mock the recipe lookup (happens via getDb().collection('recipes').doc(recipeId).get())
    mockRecipesDocGet.mockResolvedValueOnce({
      exists: true,
      data: () => makeRecipe({ servings: 2 }),
    });

    const body = {
      date: '2026-03-15',
      mealType: 'dinner',
      recipeId: RECIPE_ID,
      recipeName: 'Chicken Salad',
      servingsConsumed: 3,
    };

    const res = await request(buildApp())
      .post('/nutrition/meals')
      .set('Authorization', VALID_TOKEN)
      .send(body);

    expect(res.status).toBe(201);
    expect(res.body.recipeId).toBe(RECIPE_ID);
    // Recipe has: iron=(2+1)/2=1.5, zinc=4/2=2, vitaminC=10/2=5 per serving
    // servingsConsumed=3, so: iron=4.5, zinc=6, vitaminC=15
    expect(res.body.nutrients).toEqual(
      expect.arrayContaining([
        { nutrientId: 'iron', amount: 4.5 },
        { nutrientId: 'zinc', amount: 6 },
        { nutrientId: 'vitaminC', amount: 15 },
      ]),
    );
  });

  it('uses direct nutrients when recipe is not found', async () => {
    mockMealsDocSet.mockResolvedValueOnce(undefined);
    mockRecipesDocGet.mockResolvedValueOnce({ exists: false });

    const body = {
      date: '2026-03-15',
      mealType: 'snack',
      recipeId: 'nonexistent-recipe',
      recipeName: 'Mystery Food',
      servingsConsumed: 1,
      nutrients: [{ nutrientId: 'vitaminC', amount: 20 }],
    };

    const res = await request(buildApp())
      .post('/nutrition/meals')
      .set('Authorization', VALID_TOKEN)
      .send(body);

    expect(res.status).toBe(201);
    expect(res.body.nutrients).toEqual([{ nutrientId: 'vitaminC', amount: 20 }]);
  });

  it('logs meal with empty nutrients when no recipe and no direct nutrients', async () => {
    mockMealsDocSet.mockResolvedValueOnce(undefined);

    const body = {
      date: '2026-03-15',
      mealType: 'snack',
      recipeName: 'Unknown Snack',
      servingsConsumed: 1,
    };

    const res = await request(buildApp())
      .post('/nutrition/meals')
      .set('Authorization', VALID_TOKEN)
      .send(body);

    expect(res.status).toBe(201);
    expect(res.body.nutrients).toEqual([]);
  });
});

describe('GET /nutrition/meals', () => {
  it('returns 401 without auth', async () => {
    const res = await request(buildApp()).get('/nutrition/meals');
    expect(res.status).toBe(401);
  });

  it('returns meals for a specific date', async () => {
    const meal1 = makeMeal({ id: 'm1', mealType: 'breakfast', createdAt: '2026-03-15T08:00:00.000Z' });
    const meal2 = makeMeal({ id: 'm2', mealType: 'lunch', createdAt: '2026-03-15T12:00:00.000Z' });

    mockMealsQueryGet.mockResolvedValueOnce({
      docs: [{ data: () => meal1 }, { data: () => meal2 }],
    });

    const res = await request(buildApp())
      .get('/nutrition/meals?date=2026-03-15')
      .set('Authorization', VALID_TOKEN);

    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(2);
    expect(res.body[0].id).toBe('m1');
    expect(res.body[1].id).toBe('m2');

    expect(mockMealsCollectionWhere).toHaveBeenCalledWith('uid', '==', TEST_UID);
    expect(mockMealsQueryChain.where).toHaveBeenCalledWith('date', '==', '2026-03-15');
    expect(mockMealsQueryChain.orderBy).toHaveBeenCalledWith('createdAt', 'asc');
  });

  it('returns empty array when no meals on date', async () => {
    mockMealsQueryGet.mockResolvedValueOnce({ docs: [] });

    const res = await request(buildApp())
      .get('/nutrition/meals?date=2026-03-15')
      .set('Authorization', VALID_TOKEN);

    expect(res.status).toBe(200);
    expect(res.body).toEqual([]);
  });

  it('defaults to today when date is not provided', async () => {
    mockMealsQueryGet.mockResolvedValueOnce({ docs: [] });

    const today = new Date().toISOString().split('T')[0];

    const res = await request(buildApp())
      .get('/nutrition/meals')
      .set('Authorization', VALID_TOKEN);

    expect(res.status).toBe(200);
    expect(mockMealsQueryChain.where).toHaveBeenCalledWith('date', '==', today);
  });

  it('returns 400 when date format is invalid', async () => {
    const res = await request(buildApp())
      .get('/nutrition/meals?date=not-a-date')
      .set('Authorization', VALID_TOKEN);

    expect(res.status).toBe(400);
    expect(res.body).toMatchObject({ error: expect.stringContaining('YYYY-MM-DD') });
  });
});

describe('DELETE /nutrition/meals/:id', () => {
  it('returns 401 without auth', async () => {
    const res = await request(buildApp()).delete(`/nutrition/meals/${MEAL_ID}`);
    expect(res.status).toBe(401);
  });

  it('returns 404 when meal does not exist', async () => {
    mockMealsDocGet.mockResolvedValueOnce({ exists: false });

    const res = await request(buildApp())
      .delete(`/nutrition/meals/${MEAL_ID}`)
      .set('Authorization', VALID_TOKEN);

    expect(res.status).toBe(404);
    expect(res.body).toMatchObject({ error: 'Meal entry not found' });
  });

  it('returns 404 when meal belongs to another user', async () => {
    mockMealsDocGet.mockResolvedValueOnce({
      exists: true,
      data: () => makeMeal({ uid: OTHER_UID }),
    });

    const res = await request(buildApp())
      .delete(`/nutrition/meals/${MEAL_ID}`)
      .set('Authorization', VALID_TOKEN);

    expect(res.status).toBe(404);
    expect(res.body).toMatchObject({ error: 'Meal entry not found' });
  });

  it('deletes meal and returns 204', async () => {
    mockMealsDocGet.mockResolvedValueOnce({
      exists: true,
      data: () => makeMeal(),
    });
    mockMealsDocDelete.mockResolvedValueOnce(undefined);

    const res = await request(buildApp())
      .delete(`/nutrition/meals/${MEAL_ID}`)
      .set('Authorization', VALID_TOKEN);

    expect(res.status).toBe(204);
    expect(res.body).toEqual({});
    expect(mockMealsDocDelete).toHaveBeenCalledOnce();
  });
});
