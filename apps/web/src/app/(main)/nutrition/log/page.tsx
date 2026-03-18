'use client';

import { useState, useMemo, useCallback, useEffect } from 'react';
import { useAuth } from '@/lib/auth-context';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import {
  useRecipes,
  useRecipe,
  useFoodSearch,
  useLogMeal,
} from '@/lib/nutrition-queries';
import {
  SUPPORTED_NUTRIENTS,
  type NutrientAmount,
  type FoodSearchResult,
  type Recipe,
} from '@burnbuddy/shared';
import { ArrowLeft, Search, ChevronDown, Check, Loader2 } from 'lucide-react';

type MealType = 'breakfast' | 'lunch' | 'dinner' | 'snack';
type SourceMode = 'recipe' | 'food';

const MEAL_TYPES: { value: MealType; label: string; emoji: string }[] = [
  { value: 'breakfast', label: 'Breakfast', emoji: '🌅' },
  { value: 'lunch', label: 'Lunch', emoji: '☀️' },
  { value: 'dinner', label: 'Dinner', emoji: '🌙' },
  { value: 'snack', label: 'Snack', emoji: '🍎' },
];

function formatDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function nutrientLabel(nId: string): { name: string; unit: string } {
  const info = SUPPORTED_NUTRIENTS.find((n) => n.id === nId);
  return info ? { name: info.name, unit: info.unit } : { name: nId, unit: '' };
}

function scaleNutrients(nutrients: NutrientAmount[], factor: number): NutrientAmount[] {
  return nutrients.map((n) => ({
    nutrientId: n.nutrientId,
    amount: Math.round(n.amount * factor * 100) / 100,
  }));
}

export default function LogMealPage() {
  const { user, loading: authLoading } = useAuth();
  const router = useRouter();
  const logMeal = useLogMeal();

  // Form state
  const [mealType, setMealType] = useState<MealType>('breakfast');
  const [date, setDate] = useState(formatDate(new Date()));
  const [sourceMode, setSourceMode] = useState<SourceMode>('recipe');
  const [servings, setServings] = useState(1);

  // Recipe selection
  const [recipeDropdownOpen, setRecipeDropdownOpen] = useState(false);
  const [selectedRecipeId, setSelectedRecipeId] = useState('');
  const [recipeFilter, setRecipeFilter] = useState('');

  // Food search
  const [foodQuery, setFoodQuery] = useState('');
  const [debouncedFoodQuery, setDebouncedFoodQuery] = useState('');
  const [selectedFood, setSelectedFood] = useState<FoodSearchResult | null>(null);

  // Success feedback
  const [showSuccess, setShowSuccess] = useState(false);

  // Queries
  const { data: recipes, isLoading: recipesLoading } = useRecipes();
  const { data: recipeDetail } = useRecipe(selectedRecipeId);
  const { data: foodResults, isFetching: foodSearching } = useFoodSearch(debouncedFoodQuery);

  // Debounce food search
  useEffect(() => {
    const timer = setTimeout(() => setDebouncedFoodQuery(foodQuery), 300);
    return () => clearTimeout(timer);
  }, [foodQuery]);

  // Filter recipes
  const filteredRecipes = useMemo(() => {
    if (!recipes) return [];
    if (!recipeFilter.trim()) return recipes;
    const q = recipeFilter.toLowerCase();
    return recipes.filter((r) => r.name.toLowerCase().includes(q));
  }, [recipes, recipeFilter]);

  // Selected recipe object
  const selectedRecipe = useMemo(
    () => recipes?.find((r) => r.id === selectedRecipeId),
    [recipes, selectedRecipeId],
  );

  // Determine name and nutrients to display
  const mealName = sourceMode === 'recipe'
    ? (selectedRecipe?.name ?? '')
    : (selectedFood?.description ?? '');

  const baseNutrients: NutrientAmount[] = useMemo(() => {
    if (sourceMode === 'recipe' && recipeDetail?.nutrientsPerServing) {
      return recipeDetail.nutrientsPerServing;
    }
    if (sourceMode === 'food' && selectedFood) {
      return selectedFood.nutrients;
    }
    return [];
  }, [sourceMode, recipeDetail, selectedFood]);

  const previewNutrients = useMemo(
    () => scaleNutrients(baseNutrients, servings),
    [baseNutrients, servings],
  );

  const canSubmit = mealName.trim() !== '' && servings > 0 && !logMeal.isPending;

  const handleSelectRecipe = useCallback((recipe: Recipe) => {
    setSelectedRecipeId(recipe.id);
    setRecipeDropdownOpen(false);
    setRecipeFilter('');
  }, []);

  const handleSelectFood = useCallback((food: FoodSearchResult) => {
    setSelectedFood(food);
    setFoodQuery('');
    setDebouncedFoodQuery('');
  }, []);

  const handleSubmit = async () => {
    if (!canSubmit) return;
    try {
      await logMeal.mutateAsync({
        date,
        mealType,
        recipeId: sourceMode === 'recipe' ? selectedRecipeId : undefined,
        recipeName: mealName,
        servingsConsumed: servings,
        nutrients: sourceMode === 'food' ? previewNutrients : undefined,
      });
      setShowSuccess(true);
      setTimeout(() => router.push('/nutrition'), 800);
    } catch {
      // mutation error handled via logMeal.error
    }
  };

  if (authLoading) {
    return (
      <main className="mx-auto max-w-lg px-4 py-6">
        <div className="animate-pulse space-y-4">
          <div className="h-8 w-40 rounded bg-gray-700" />
          <div className="h-12 rounded bg-gray-700" />
          <div className="h-12 rounded bg-gray-700" />
        </div>
      </main>
    );
  }

  if (!user) {
    return (
      <main className="mx-auto max-w-lg px-4 py-6 text-center text-gray-400">
        Please sign in to log meals.
      </main>
    );
  }

  if (showSuccess) {
    return (
      <main className="mx-auto max-w-lg px-4 py-6 text-center">
        <div className="mt-16 space-y-3">
          <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-green-600/20">
            <Check className="h-7 w-7 text-green-400" />
          </div>
          <p className="text-lg font-semibold text-white">Meal Logged!</p>
          <p className="text-sm text-gray-400">Redirecting to dashboard…</p>
        </div>
      </main>
    );
  }

  return (
    <main className="mx-auto max-w-lg px-4 py-6">
      {/* Header */}
      <div className="mb-6 flex items-center gap-3">
        <Link
          href="/nutrition"
          className="flex h-8 w-8 items-center justify-center rounded-lg border border-gray-700 text-gray-400 no-underline hover:bg-surface-elevated"
        >
          <ArrowLeft className="h-4 w-4" />
        </Link>
        <h1 className="text-xl font-bold text-white">Log a Meal</h1>
      </div>

      {/* Error */}
      {logMeal.error && (
        <div className="mb-4 rounded-lg border border-red-700 bg-red-900/30 px-4 py-3 text-sm text-red-300">
          {(logMeal.error as Error).message || 'Failed to log meal. Please try again.'}
        </div>
      )}

      {/* Date Picker */}
      <section className="mb-6">
        <label className="mb-1.5 block text-sm font-semibold text-white">Date</label>
        <input
          type="date"
          value={date}
          max={formatDate(new Date())}
          onChange={(e) => setDate(e.target.value)}
          className="w-full rounded-lg border border-gray-600 bg-surface-elevated px-3 py-2 text-white focus:ring-2 focus:ring-secondary focus:outline-none"
        />
      </section>

      {/* Meal Type Selector */}
      <section className="mb-6">
        <label className="mb-1.5 block text-sm font-semibold text-white">Meal Type</label>
        <div className="grid grid-cols-4 gap-2">
          {MEAL_TYPES.map((mt) => (
            <button
              key={mt.value}
              type="button"
              onClick={() => setMealType(mt.value)}
              className={`flex flex-col items-center gap-1 rounded-lg border px-2 py-2.5 text-center transition-colors ${
                mealType === mt.value
                  ? 'border-secondary bg-secondary/20 text-white'
                  : 'border-gray-700 bg-surface text-gray-400 hover:bg-surface-elevated'
              }`}
            >
              <span className="text-lg">{mt.emoji}</span>
              <span className="text-xs font-medium">{mt.label}</span>
            </button>
          ))}
        </div>
      </section>

      {/* Source Mode Toggle */}
      <section className="mb-6">
        <label className="mb-1.5 block text-sm font-semibold text-white">Source</label>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => {
              setSourceMode('recipe');
              setSelectedFood(null);
            }}
            className={`flex-1 rounded-lg border px-3 py-2 text-sm font-medium transition-colors ${
              sourceMode === 'recipe'
                ? 'border-secondary bg-secondary/20 text-white'
                : 'border-gray-700 bg-surface text-gray-400 hover:bg-surface-elevated'
            }`}
          >
            📖 Saved Recipes
          </button>
          <button
            type="button"
            onClick={() => {
              setSourceMode('food');
              setSelectedRecipeId('');
            }}
            className={`flex-1 rounded-lg border px-3 py-2 text-sm font-medium transition-colors ${
              sourceMode === 'food'
                ? 'border-secondary bg-secondary/20 text-white'
                : 'border-gray-700 bg-surface text-gray-400 hover:bg-surface-elevated'
            }`}
          >
            🔍 Search Foods
          </button>
        </div>
      </section>

      {/* Recipe Selection */}
      {sourceMode === 'recipe' && (
        <section className="mb-6">
          <label className="mb-1.5 block text-sm font-semibold text-white">Select Recipe</label>
          <div className="relative">
            <button
              type="button"
              onClick={() => setRecipeDropdownOpen((v) => !v)}
              className="flex w-full items-center justify-between rounded-lg border border-gray-600 bg-surface-elevated px-3 py-2 text-left text-sm text-white focus:ring-2 focus:ring-secondary focus:outline-none"
            >
              <span className={selectedRecipe ? 'text-white' : 'text-gray-500'}>
                {selectedRecipe?.name ?? 'Choose a recipe…'}
              </span>
              <ChevronDown className={`h-4 w-4 text-gray-400 transition-transform ${recipeDropdownOpen ? 'rotate-180' : ''}`} />
            </button>

            {recipeDropdownOpen && (
              <div className="absolute z-20 mt-1 max-h-60 w-full overflow-y-auto rounded-lg border border-gray-600 bg-surface-elevated shadow-lg">
                <div className="sticky top-0 border-b border-gray-700 bg-surface-elevated p-2">
                  <input
                    type="text"
                    placeholder="Filter recipes…"
                    value={recipeFilter}
                    onChange={(e) => setRecipeFilter(e.target.value)}
                    className="w-full rounded border border-gray-600 bg-surface px-2 py-1.5 text-sm text-white placeholder:text-gray-500 focus:ring-1 focus:ring-secondary focus:outline-none"
                    autoFocus
                  />
                </div>
                {recipesLoading ? (
                  <div className="flex items-center justify-center p-4">
                    <Loader2 className="h-5 w-5 animate-spin text-gray-400" />
                  </div>
                ) : filteredRecipes.length === 0 ? (
                  <div className="p-3 text-center text-sm text-gray-500">
                    {recipes?.length === 0 ? 'No saved recipes yet' : 'No recipes match'}
                  </div>
                ) : (
                  filteredRecipes.map((r) => (
                    <button
                      key={r.id}
                      type="button"
                      onClick={() => handleSelectRecipe(r)}
                      className={`flex w-full items-center gap-2 px-3 py-2.5 text-left text-sm hover:bg-surface ${
                        r.id === selectedRecipeId ? 'bg-secondary/10 text-white' : 'text-gray-300'
                      }`}
                    >
                      <span className="flex-1 truncate">{r.name}</span>
                      {r.id === selectedRecipeId && <Check className="h-4 w-4 text-secondary" />}
                    </button>
                  ))
                )}
              </div>
            )}
          </div>
        </section>
      )}

      {/* Food Search */}
      {sourceMode === 'food' && (
        <section className="mb-6">
          <label className="mb-1.5 block text-sm font-semibold text-white">Search Foods</label>
          <div className="relative">
            <Search className="pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-gray-400" />
            <input
              type="text"
              placeholder="Search USDA foods (e.g. spinach, salmon)…"
              value={foodQuery}
              onChange={(e) => {
                setFoodQuery(e.target.value);
                setSelectedFood(null);
              }}
              className="w-full rounded-lg border border-gray-600 bg-surface-elevated py-2 pr-3 pl-9 text-sm text-white placeholder:text-gray-500 focus:ring-2 focus:ring-secondary focus:outline-none"
            />
          </div>

          {/* Selected food badge */}
          {selectedFood && !foodQuery && (
            <div className="mt-2 flex items-center gap-2 rounded-lg border border-secondary/40 bg-secondary/10 px-3 py-2">
              <span className="flex-1 text-sm text-white">{selectedFood.description}</span>
              <button
                type="button"
                onClick={() => setSelectedFood(null)}
                className="text-xs text-gray-400 hover:text-white"
              >
                ✕
              </button>
            </div>
          )}

          {/* Search results */}
          {foodQuery.trim() && (
            <div className="mt-2 max-h-52 overflow-y-auto rounded-lg border border-gray-600 bg-surface-elevated">
              {foodSearching ? (
                <div className="flex items-center justify-center p-4">
                  <Loader2 className="h-5 w-5 animate-spin text-gray-400" />
                  <span className="ml-2 text-sm text-gray-400">Searching…</span>
                </div>
              ) : !foodResults || foodResults.length === 0 ? (
                <div className="p-3 text-center text-sm text-gray-500">No results found</div>
              ) : (
                foodResults.map((food) => (
                  <button
                    key={food.fdcId}
                    type="button"
                    onClick={() => handleSelectFood(food)}
                    className="flex w-full flex-col gap-0.5 border-b border-gray-700 px-3 py-2.5 text-left last:border-0 hover:bg-surface"
                  >
                    <span className="text-sm text-white">{food.description}</span>
                    {food.brandOwner && (
                      <span className="text-xs text-gray-500">{food.brandOwner}</span>
                    )}
                    <span className="text-xs text-gray-400">
                      {food.nutrients
                        .slice(0, 3)
                        .map((n) => {
                          const { name, unit } = nutrientLabel(n.nutrientId);
                          return `${name}: ${n.amount}${unit}`;
                        })
                        .join(' · ')}
                    </span>
                  </button>
                ))
              )}
            </div>
          )}
        </section>
      )}

      {/* Servings Adjuster */}
      <section className="mb-6">
        <label className="mb-1.5 block text-sm font-semibold text-white">Servings</label>
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => setServings((s) => Math.max(0.5, s - 0.5))}
            disabled={servings <= 0.5}
            className="flex h-10 w-10 items-center justify-center rounded-lg border border-gray-600 bg-surface text-lg text-white hover:bg-surface-elevated disabled:opacity-40"
          >
            −
          </button>
          <input
            type="number"
            min={0.25}
            step={0.25}
            value={servings}
            onChange={(e) => {
              const v = parseFloat(e.target.value);
              if (!isNaN(v) && v > 0) setServings(v);
            }}
            className="w-20 rounded-lg border border-gray-600 bg-surface-elevated px-3 py-2 text-center text-white focus:ring-2 focus:ring-secondary focus:outline-none"
          />
          <button
            type="button"
            onClick={() => setServings((s) => s + 0.5)}
            className="flex h-10 w-10 items-center justify-center rounded-lg border border-gray-600 bg-surface text-lg text-white hover:bg-surface-elevated"
          >
            +
          </button>
        </div>
      </section>

      {/* Nutrient Summary Preview */}
      {previewNutrients.length > 0 && (
        <section className="mb-6">
          <label className="mb-1.5 block text-sm font-semibold text-white">
            Nutrient Preview
            {servings !== 1 && <span className="ml-1 font-normal text-gray-400">({servings} serving{servings !== 1 ? 's' : ''})</span>}
          </label>
          <div className="rounded-lg border border-gray-700 bg-surface p-3">
            <div className="grid grid-cols-2 gap-x-4 gap-y-1.5">
              {previewNutrients.map((n) => {
                const { name, unit } = nutrientLabel(n.nutrientId);
                return (
                  <div key={n.nutrientId} className="flex items-baseline justify-between text-sm">
                    <span className="text-gray-400">{name}</span>
                    <span className="font-mono text-white">
                      {n.amount}
                      <span className="ml-0.5 text-xs text-gray-500">{unit}</span>
                    </span>
                  </div>
                );
              })}
            </div>
            {previewNutrients.length === 0 && (
              <p className="text-center text-sm text-gray-500">No nutrient data available</p>
            )}
          </div>
        </section>
      )}

      {/* Submit */}
      <button
        type="button"
        onClick={handleSubmit}
        disabled={!canSubmit}
        className="w-full rounded-lg bg-secondary px-4 py-3 text-center text-sm font-semibold text-white transition-colors hover:bg-secondary/80 disabled:opacity-40 disabled:cursor-not-allowed"
      >
        {logMeal.isPending ? (
          <span className="flex items-center justify-center gap-2">
            <Loader2 className="h-4 w-4 animate-spin" />
            Logging…
          </span>
        ) : (
          'Log Meal'
        )}
      </button>
    </main>
  );
}
