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

export interface Ingredient {
  id: string;
  name: string;
  quantity: number;
  unit: string;
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
