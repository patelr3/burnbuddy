export type NutrientId =
  | 'iron'
  | 'vitaminD'
  | 'calcium'
  | 'vitaminB12'
  | 'vitaminC'
  | 'zinc'
  | 'magnesium'
  | 'folate'
  | 'potassium'
  | 'omega3';

export interface NutrientInfo {
  id: NutrientId;
  name: string;
  unit: string;
  dailyRecommended: number;
}

export interface NutrientAmount {
  nutrientId: NutrientId;
  amount: number;
}

export const SUPPORTED_UNITS = ['g', 'mg', 'oz', 'cup', 'tbsp', 'tsp', 'serving', 'ml', 'L', 'lb'] as const;

export type IngredientUnit = (typeof SUPPORTED_UNITS)[number];

export interface Ingredient {
  id: string;
  name: string;
  quantity: number;
  unit: IngredientUnit | string; // string allows existing recipes with non-standard units
  nutrients: NutrientAmount[];
  fdcId?: string;
}

export interface Recipe {
  id: string;
  uid: string;
  name: string;
  description?: string;
  ingredients: Ingredient[];
  directNutrients?: NutrientAmount[];
  servings: number;
  createdAt: string;
  updatedAt: string;
}

export interface MealEntry {
  id: string;
  uid: string;
  date: string;
  mealType: 'breakfast' | 'lunch' | 'dinner' | 'snack';
  recipeId?: string;
  recipeName: string;
  servingsConsumed: number;
  nutrients: NutrientAmount[];
  createdAt: string;
}

export interface NutritionGoals {
  uid: string;
  targetNutrients: NutrientId[];
  updatedAt: string;
}

export interface DailyNutritionSummary {
  date: string;
  nutrients: {
    nutrientId: NutrientId;
    consumed: number;
    recommended: number;
    percentComplete: number;
  }[];
  pointsEarned: number;
}

export interface FoodSearchResult {
  fdcId: string;
  description: string;
  brandOwner?: string;
  nutrients: NutrientAmount[];
}

export interface Supplement {
  id: string;
  name: string;
  brand?: string;
  nutrients: NutrientAmount[];
  isCustom: boolean;
}

export interface SupplementEntry {
  id: string;
  uid: string;
  date: string; // YYYY-MM-DD
  supplementName: string;
  nutrients: NutrientAmount[];
  createdAt: string;
}

/** NIH Recommended Daily Allowances for adults */
export const SUPPORTED_NUTRIENTS: NutrientInfo[] = [
  { id: 'iron', name: 'Iron', unit: 'mg', dailyRecommended: 18 },
  { id: 'vitaminD', name: 'Vitamin D', unit: 'mcg', dailyRecommended: 20 },
  { id: 'calcium', name: 'Calcium', unit: 'mg', dailyRecommended: 1000 },
  { id: 'vitaminB12', name: 'Vitamin B12', unit: 'mcg', dailyRecommended: 2.4 },
  { id: 'vitaminC', name: 'Vitamin C', unit: 'mg', dailyRecommended: 90 },
  { id: 'zinc', name: 'Zinc', unit: 'mg', dailyRecommended: 11 },
  { id: 'magnesium', name: 'Magnesium', unit: 'mg', dailyRecommended: 420 },
  { id: 'folate', name: 'Folate', unit: 'mcg', dailyRecommended: 400 },
  { id: 'potassium', name: 'Potassium', unit: 'mg', dailyRecommended: 2600 },
  { id: 'omega3', name: 'Omega-3', unit: 'g', dailyRecommended: 1.6 },
];

/** Common over-the-counter supplements with typical nutrient amounts */
export const COMMON_SUPPLEMENTS: Supplement[] = [
  {
    id: 'vitamin-d3-1000iu',
    name: 'Vitamin D3 1000 IU',
    nutrients: [{ nutrientId: 'vitaminD', amount: 25 }], // 1000 IU = 25 mcg
    isCustom: false,
  },
  {
    id: 'vitamin-c-500mg',
    name: 'Vitamin C 500mg',
    nutrients: [{ nutrientId: 'vitaminC', amount: 500 }],
    isCustom: false,
  },
  {
    id: 'calcium-600mg',
    name: 'Calcium 600mg',
    nutrients: [{ nutrientId: 'calcium', amount: 600 }],
    isCustom: false,
  },
  {
    id: 'iron-65mg',
    name: 'Iron 65mg',
    nutrients: [{ nutrientId: 'iron', amount: 65 }],
    isCustom: false,
  },
  {
    id: 'vitamin-b12-1000mcg',
    name: 'Vitamin B12 1000mcg',
    nutrients: [{ nutrientId: 'vitaminB12', amount: 1000 }],
    isCustom: false,
  },
  {
    id: 'zinc-50mg',
    name: 'Zinc 50mg',
    nutrients: [{ nutrientId: 'zinc', amount: 50 }],
    isCustom: false,
  },
  {
    id: 'magnesium-400mg',
    name: 'Magnesium 400mg',
    nutrients: [{ nutrientId: 'magnesium', amount: 400 }],
    isCustom: false,
  },
  {
    id: 'fish-oil-omega3-1000mg',
    name: 'Fish Oil / Omega-3 1000mg',
    nutrients: [{ nutrientId: 'omega3', amount: 1 }], // ~1g EPA+DHA per 1000mg capsule
    isCustom: false,
  },
];
