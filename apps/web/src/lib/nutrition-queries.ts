import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiGet, apiPost, apiPut, apiDelete } from './api';
import type {
  Recipe,
  MealEntry,
  NutritionGoals,
  DailyNutritionSummary,
  FoodSearchResult,
  NutrientId,
  Ingredient,
  NutrientAmount,
  SupplementEntry,
} from '@burnbuddy/shared';

// ── Query keys ───────────────────────────────────────────────────────────────

export const nutritionKeys = {
  nutritionSummary: (date: string) => ['nutrition-summary', date] as const,
  nutritionMeals: (date: string) => ['nutrition-meals', date] as const,
  nutritionSupplements: (date: string) => ['nutrition-supplements', date] as const,
  recipes: ['recipes'] as const,
  recipe: (id: string) => ['recipe', id] as const,
  nutritionGoals: ['nutrition-goals'] as const,
  foodSearch: (query: string) => ['food-search', query] as const,
};

// ── Response types ───────────────────────────────────────────────────────────

export interface RecipeWithNutrients extends Recipe {
  nutrientsPerServing?: NutrientAmount[];
}

// ── Query hooks ──────────────────────────────────────────────────────────────

export function useNutritionSummary(date: string) {
  return useQuery({
    queryKey: nutritionKeys.nutritionSummary(date),
    queryFn: () => apiGet<DailyNutritionSummary>(`/nutrition/summary?date=${date}`),
    enabled: !!date,
  });
}

export function useNutritionMeals(date: string) {
  return useQuery({
    queryKey: nutritionKeys.nutritionMeals(date),
    queryFn: () => apiGet<MealEntry[]>(`/nutrition/meals?date=${date}`),
    enabled: !!date,
  });
}

export function useRecipes() {
  return useQuery({
    queryKey: nutritionKeys.recipes,
    queryFn: () => apiGet<Recipe[]>('/nutrition/recipes'),
  });
}

export function useRecipe(id: string) {
  return useQuery({
    queryKey: nutritionKeys.recipe(id),
    queryFn: () => apiGet<RecipeWithNutrients>(`/nutrition/recipes/${id}`),
    enabled: !!id,
  });
}

export function useNutritionGoals() {
  return useQuery({
    queryKey: nutritionKeys.nutritionGoals,
    queryFn: () => apiGet<NutritionGoals>('/nutrition/goals'),
  });
}

export function useFoodSearch(query: string) {
  return useQuery({
    queryKey: nutritionKeys.foodSearch(query),
    queryFn: () => apiGet<FoodSearchResult[]>(`/nutrition/foods/search?q=${encodeURIComponent(query)}`),
    enabled: query.trim().length > 0,
    placeholderData: (prev) => prev,
  });
}

// ── Mutation hooks ───────────────────────────────────────────────────────────

interface LogMealInput {
  date: string;
  mealType: 'breakfast' | 'lunch' | 'dinner' | 'snack';
  recipeId?: string;
  recipeName: string;
  servingsConsumed: number;
  nutrients?: NutrientAmount[];
}

export function useLogMeal() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: LogMealInput) => apiPost<MealEntry>('/nutrition/meals', input),
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: nutritionKeys.nutritionMeals(variables.date) });
      queryClient.invalidateQueries({ queryKey: nutritionKeys.nutritionSummary(variables.date) });
    },
  });
}

export function useDeleteMeal() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (mealId: string) => apiDelete(`/nutrition/meals/${mealId}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['nutrition-meals'] });
      queryClient.invalidateQueries({ queryKey: ['nutrition-summary'] });
    },
  });
}

interface CreateRecipeInput {
  name: string;
  description?: string;
  ingredients: Omit<Ingredient, 'id'>[];
  directNutrients?: NutrientAmount[];
  servings: number;
}

export function useCreateRecipe() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateRecipeInput) => apiPost<Recipe>('/nutrition/recipes', input),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: nutritionKeys.recipes });
    },
  });
}

interface UpdateRecipeInput {
  id: string;
  data: Partial<CreateRecipeInput>;
}

export function useUpdateRecipe() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, data }: UpdateRecipeInput) => apiPut<Recipe>(`/nutrition/recipes/${id}`, data),
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: nutritionKeys.recipes });
      queryClient.invalidateQueries({ queryKey: nutritionKeys.recipe(variables.id) });
    },
  });
}

export function useDeleteRecipe() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (recipeId: string) => apiDelete(`/nutrition/recipes/${recipeId}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: nutritionKeys.recipes });
    },
  });
}

export function useUpdateNutritionGoals() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (targetNutrients: NutrientId[]) =>
      apiPut<NutritionGoals>('/nutrition/goals', { targetNutrients }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: nutritionKeys.nutritionGoals });
      queryClient.invalidateQueries({ queryKey: ['nutrition-summary'] });
    },
  });
}

// ── Supplement hooks ─────────────────────────────────────────────────────────

export function useNutritionSupplements(date: string) {
  return useQuery({
    queryKey: nutritionKeys.nutritionSupplements(date),
    queryFn: () => apiGet<SupplementEntry[]>(`/nutrition/supplements?date=${date}`),
    enabled: !!date,
  });
}

interface LogSupplementInput {
  date: string;
  supplementName: string;
  nutrients: NutrientAmount[];
}

export function useLogSupplement() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: LogSupplementInput) =>
      apiPost<SupplementEntry>('/nutrition/supplements', input),
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: nutritionKeys.nutritionSupplements(variables.date) });
      queryClient.invalidateQueries({ queryKey: nutritionKeys.nutritionSummary(variables.date) });
    },
  });
}

// ── Manual goal completion hooks ─────────────────────────────────────────────

export function useCompleteGoal() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (nutrientId: NutrientId) =>
      apiPost<{ message: string; nutrientId: string; date: string }>('/nutrition/goals/complete', { nutrientId }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['nutrition-summary'] });
    },
  });
}

export function useUndoCompleteGoal() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (nutrientId: NutrientId) =>
      apiDelete(`/nutrition/goals/complete/${nutrientId}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['nutrition-summary'] });
    },
  });
}
