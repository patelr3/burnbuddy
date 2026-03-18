'use client';

import { useState, useMemo, useCallback, useEffect } from 'react';
import { useRouter, useParams } from 'next/navigation';
import Link from 'next/link';
import { useAuth } from '@/lib/auth-context';
import {
  useRecipe,
  useUpdateRecipe,
  useDeleteRecipe,
  useFoodSearch,
} from '@/lib/nutrition-queries';
import {
  SUPPORTED_NUTRIENTS,
  type NutrientAmount,
  type FoodSearchResult,
  type NutrientId,
} from '@burnbuddy/shared';
import { ArrowLeft, Plus, X, Search, Loader2, Check, Trash2 } from 'lucide-react';

interface IngredientRow {
  localId: string;
  name: string;
  quantity: number;
  unit: string;
  nutrients: NutrientAmount[];
  fdcId?: string;
}

function nutrientLabel(nId: string): { name: string; unit: string } {
  const info = SUPPORTED_NUTRIENTS.find((n) => n.id === nId);
  return info ? { name: info.name, unit: info.unit } : { name: nId, unit: '' };
}

let nextLocalId = 1;
function genLocalId(): string {
  return `ing_${Date.now()}_${nextLocalId++}`;
}

export default function EditRecipePage() {
  const { loading: authLoading } = useAuth();
  const router = useRouter();
  const params = useParams();
  const recipeId = params.id as string;

  const { data: existingRecipe, isLoading: recipeLoading } = useRecipe(recipeId);
  const updateRecipe = useUpdateRecipe();
  const deleteRecipe = useDeleteRecipe();

  // Form fields
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [servings, setServings] = useState(1);
  const [directMode, setDirectMode] = useState(false);

  // Ingredients
  const [ingredients, setIngredients] = useState<IngredientRow[]>([]);

  // Direct nutrients
  const [directNutrients, setDirectNutrients] = useState<Record<NutrientId, string>>(() => {
    const initial: Record<string, string> = {};
    for (const n of SUPPORTED_NUTRIENTS) initial[n.id] = '';
    return initial as Record<NutrientId, string>;
  });

  // Track whether we've initialized from existing recipe
  const [initialized, setInitialized] = useState(false);

  // Ingredient add flow
  const [addingIngredient, setAddingIngredient] = useState(false);
  const [foodQuery, setFoodQuery] = useState('');
  const [debouncedFoodQuery, setDebouncedFoodQuery] = useState('');
  const [selectedFood, setSelectedFood] = useState<FoodSearchResult | null>(null);
  const [ingredientQty, setIngredientQty] = useState(1);
  const [ingredientUnit, setIngredientUnit] = useState('serving');

  // Delete confirmation
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

  // Success feedback
  const [showSuccess, setShowSuccess] = useState(false);

  const { data: foodResults, isFetching: foodSearching } = useFoodSearch(debouncedFoodQuery);

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedFoodQuery(foodQuery), 300);
    return () => clearTimeout(timer);
  }, [foodQuery]);

  // Initialize form from existing recipe
  useEffect(() => {
    if (!existingRecipe || initialized) return;

    setName(existingRecipe.name);
    setDescription(existingRecipe.description ?? '');
    setServings(existingRecipe.servings);

    // If recipe has directNutrients, use direct mode
    if (existingRecipe.directNutrients && existingRecipe.directNutrients.length > 0) {
      setDirectMode(true);
      const vals: Record<string, string> = {};
      for (const n of SUPPORTED_NUTRIENTS) vals[n.id] = '';
      for (const n of existingRecipe.directNutrients) {
        vals[n.nutrientId] = String(n.amount);
      }
      setDirectNutrients(vals as Record<NutrientId, string>);
    }

    // Load ingredients
    if (existingRecipe.ingredients.length > 0) {
      setIngredients(
        existingRecipe.ingredients.map((ing) => ({
          localId: genLocalId(),
          name: ing.name,
          quantity: ing.quantity,
          unit: ing.unit,
          nutrients: ing.nutrients,
          fdcId: ing.fdcId,
        })),
      );
    }

    setInitialized(true);
  }, [existingRecipe, initialized]);

  // Calculate nutrient summary per serving
  const nutrientSummary = useMemo(() => {
    if (directMode) {
      const entries: NutrientAmount[] = [];
      for (const n of SUPPORTED_NUTRIENTS) {
        const val = parseFloat(directNutrients[n.id]);
        if (val > 0) entries.push({ nutrientId: n.id, amount: val });
      }
      return entries;
    }

    const totals = new Map<NutrientId, number>();
    for (const ing of ingredients) {
      for (const n of ing.nutrients) {
        totals.set(n.nutrientId, (totals.get(n.nutrientId) ?? 0) + n.amount * ing.quantity);
      }
    }

    const perServing = Array.from(totals.entries())
      .filter(([, total]) => total > 0)
      .map(([nutrientId, total]) => ({
        nutrientId,
        amount: Math.round((total / Math.max(servings, 1)) * 100) / 100,
      }));

    return perServing;
  }, [directMode, directNutrients, ingredients, servings]);

  const handleSelectFood = useCallback((food: FoodSearchResult) => {
    setSelectedFood(food);
    setFoodQuery('');
    setDebouncedFoodQuery('');
  }, []);

  const handleAddIngredient = useCallback(() => {
    if (!selectedFood) return;
    const newIngredient: IngredientRow = {
      localId: genLocalId(),
      name: selectedFood.description,
      quantity: ingredientQty,
      unit: ingredientUnit,
      nutrients: selectedFood.nutrients,
      fdcId: selectedFood.fdcId,
    };
    setIngredients((prev) => [...prev, newIngredient]);
    setSelectedFood(null);
    setIngredientQty(1);
    setIngredientUnit('serving');
    setAddingIngredient(false);
  }, [selectedFood, ingredientQty, ingredientUnit]);

  const handleRemoveIngredient = useCallback((localId: string) => {
    setIngredients((prev) => prev.filter((i) => i.localId !== localId));
  }, []);

  const canSubmit =
    name.trim() !== '' &&
    servings > 0 &&
    !updateRecipe.isPending;

  const handleSubmit = async () => {
    if (!canSubmit) return;

    try {
      await updateRecipe.mutateAsync({
        id: recipeId,
        data: {
          name: name.trim(),
          description: description.trim() || undefined,
          servings,
          ingredients: ingredients.map((i) => ({
            name: i.name,
            quantity: i.quantity,
            unit: i.unit,
            nutrients: i.nutrients,
            fdcId: i.fdcId,
          })),
          directNutrients: directMode ? nutrientSummary : undefined,
        },
      });
      setShowSuccess(true);
      setTimeout(() => router.push('/nutrition/recipes'), 800);
    } catch {
      // error handled via updateRecipe.error
    }
  };

  const handleDelete = async () => {
    try {
      await deleteRecipe.mutateAsync(recipeId);
      router.push('/nutrition/recipes');
    } catch {
      // error handled via deleteRecipe.error
    }
  };

  if (authLoading || recipeLoading) {
    return (
      <main className="mx-auto max-w-lg px-4 py-6">
        <div className="animate-pulse space-y-4">
          <div className="h-8 w-40 rounded bg-gray-700" />
          <div className="h-12 rounded bg-gray-700" />
          <div className="h-12 rounded bg-gray-700" />
          <div className="h-12 rounded bg-gray-700" />
        </div>
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
          <p className="text-lg font-semibold text-white">Recipe Updated!</p>
          <p className="text-sm text-gray-400">Redirecting to recipes…</p>
        </div>
      </main>
    );
  }

  return (
    <main className="mx-auto max-w-lg px-4 py-6">
      {/* Header */}
      <div className="mb-6 flex items-center gap-3">
        <Link
          href="/nutrition/recipes"
          className="flex h-8 w-8 items-center justify-center rounded-lg border border-gray-700 text-gray-400 no-underline hover:bg-surface-elevated"
        >
          <ArrowLeft className="h-4 w-4" />
        </Link>
        <h1 className="text-xl font-bold text-white">Edit Recipe</h1>
      </div>

      {/* Error */}
      {(updateRecipe.error || deleteRecipe.error) && (
        <div className="mb-4 rounded-lg border border-red-700 bg-red-900/30 px-4 py-3 text-sm text-red-300">
          {((updateRecipe.error || deleteRecipe.error) as Error).message ||
            'Something went wrong. Please try again.'}
        </div>
      )}

      {/* Recipe Name */}
      <section className="mb-5">
        <label className="mb-1.5 block text-sm font-semibold text-white">
          Recipe Name <span className="text-red-400">*</span>
        </label>
        <input
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="e.g. Spinach & Salmon Bowl"
          className="w-full rounded-lg border border-gray-600 bg-surface-elevated px-3 py-2 text-white placeholder:text-gray-500 focus:ring-2 focus:ring-secondary focus:outline-none"
        />
      </section>

      {/* Description */}
      <section className="mb-5">
        <label className="mb-1.5 block text-sm font-semibold text-white">Description</label>
        <textarea
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="Optional description…"
          rows={2}
          className="w-full rounded-lg border border-gray-600 bg-surface-elevated px-3 py-2 text-white placeholder:text-gray-500 focus:ring-2 focus:ring-secondary focus:outline-none"
        />
      </section>

      {/* Servings */}
      <section className="mb-5">
        <label className="mb-1.5 block text-sm font-semibold text-white">
          Number of Servings <span className="text-red-400">*</span>
        </label>
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => setServings((s) => Math.max(1, s - 1))}
            disabled={servings <= 1}
            className="flex h-10 w-10 items-center justify-center rounded-lg border border-gray-600 bg-surface text-lg text-white hover:bg-surface-elevated disabled:opacity-40"
          >
            −
          </button>
          <input
            type="number"
            min={1}
            step={1}
            value={servings}
            onChange={(e) => {
              const v = parseInt(e.target.value, 10);
              if (!isNaN(v) && v > 0) setServings(v);
            }}
            className="w-20 rounded-lg border border-gray-600 bg-surface-elevated px-3 py-2 text-center text-white focus:ring-2 focus:ring-secondary focus:outline-none"
          />
          <button
            type="button"
            onClick={() => setServings((s) => s + 1)}
            className="flex h-10 w-10 items-center justify-center rounded-lg border border-gray-600 bg-surface text-lg text-white hover:bg-surface-elevated"
          >
            +
          </button>
        </div>
      </section>

      {/* Direct Mode Toggle */}
      <section className="mb-5">
        <label className="flex cursor-pointer items-center gap-3">
          <div
            role="switch"
            aria-checked={directMode}
            tabIndex={0}
            onClick={() => setDirectMode((v) => !v)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                setDirectMode((v) => !v);
              }
            }}
            className={`relative h-6 w-11 shrink-0 rounded-full transition-colors ${
              directMode ? 'bg-secondary' : 'bg-gray-600'
            }`}
          >
            <span
              className={`absolute top-0.5 left-0.5 h-5 w-5 rounded-full bg-white transition-transform ${
                directMode ? 'translate-x-5' : ''
              }`}
            />
          </div>
          <span className="text-sm font-medium text-gray-300">Enter nutrients manually</span>
        </label>
      </section>

      {/* Ingredients Mode */}
      {!directMode && (
        <section className="mb-5">
          <div className="mb-2 flex items-center justify-between">
            <label className="text-sm font-semibold text-white">Ingredients</label>
            <button
              type="button"
              onClick={() => setAddingIngredient(true)}
              className="inline-flex items-center gap-1 rounded-lg bg-primary/20 px-3 py-1.5 text-xs font-medium text-primary hover:bg-primary/30"
            >
              <Plus className="h-3.5 w-3.5" />
              Add Ingredient
            </button>
          </div>

          {/* Current ingredients list */}
          {ingredients.length > 0 && (
            <div className="mb-3 space-y-2">
              {ingredients.map((ing) => (
                <div
                  key={ing.localId}
                  className="flex items-center gap-2 rounded-lg border border-gray-700 bg-surface px-3 py-2"
                >
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm text-white">{ing.name}</div>
                    <div className="text-xs text-gray-400">
                      {ing.quantity} {ing.unit}
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => handleRemoveIngredient(ing.localId)}
                    className="shrink-0 rounded p-1 text-gray-500 hover:bg-surface-elevated hover:text-red-400"
                    aria-label={`Remove ${ing.name}`}
                  >
                    <X className="h-4 w-4" />
                  </button>
                </div>
              ))}
            </div>
          )}

          {ingredients.length === 0 && !addingIngredient && (
            <div className="rounded-lg border border-dashed border-gray-700 p-4 text-center text-sm text-gray-500">
              No ingredients added yet
            </div>
          )}

          {/* Add ingredient flow */}
          {addingIngredient && (
            <div className="rounded-lg border border-secondary/40 bg-surface-elevated p-3">
              <div className="mb-3 flex items-center justify-between">
                <span className="text-sm font-medium text-white">Add Ingredient</span>
                <button
                  type="button"
                  onClick={() => {
                    setAddingIngredient(false);
                    setSelectedFood(null);
                    setFoodQuery('');
                    setDebouncedFoodQuery('');
                  }}
                  className="text-xs text-gray-400 hover:text-white"
                >
                  Cancel
                </button>
              </div>

              {/* Food Search */}
              {!selectedFood && (
                <>
                  <div className="relative mb-2">
                    <Search className="pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-gray-400" />
                    <input
                      type="text"
                      placeholder="Search USDA foods…"
                      value={foodQuery}
                      onChange={(e) => setFoodQuery(e.target.value)}
                      className="w-full rounded-lg border border-gray-600 bg-surface py-2 pr-3 pl-9 text-sm text-white placeholder:text-gray-500 focus:ring-2 focus:ring-secondary focus:outline-none"
                      autoFocus
                    />
                  </div>

                  {foodQuery.trim() && (
                    <div className="max-h-48 overflow-y-auto rounded-lg border border-gray-600 bg-surface">
                      {foodSearching ? (
                        <div className="flex items-center justify-center p-3">
                          <Loader2 className="h-4 w-4 animate-spin text-gray-400" />
                          <span className="ml-2 text-xs text-gray-400">Searching…</span>
                        </div>
                      ) : !foodResults || foodResults.length === 0 ? (
                        <div className="p-3 text-center text-xs text-gray-500">No results</div>
                      ) : (
                        foodResults.map((food) => (
                          <button
                            key={food.fdcId}
                            type="button"
                            onClick={() => handleSelectFood(food)}
                            className="flex w-full flex-col gap-0.5 border-b border-gray-700 px-3 py-2 text-left last:border-0 hover:bg-surface-elevated"
                          >
                            <span className="text-sm text-white">{food.description}</span>
                            {food.brandOwner && (
                              <span className="text-xs text-gray-500">{food.brandOwner}</span>
                            )}
                            <span className="text-xs text-gray-400">
                              {food.nutrients
                                .slice(0, 3)
                                .map((n) => {
                                  const { name: nName, unit } = nutrientLabel(n.nutrientId);
                                  return `${nName}: ${n.amount}${unit}`;
                                })
                                .join(' · ')}
                            </span>
                          </button>
                        ))
                      )}
                    </div>
                  )}
                </>
              )}

              {/* Selected food — enter quantity */}
              {selectedFood && (
                <>
                  <div className="mb-3 flex items-center gap-2 rounded-lg border border-secondary/40 bg-secondary/10 px-3 py-2">
                    <span className="flex-1 truncate text-sm text-white">
                      {selectedFood.description}
                    </span>
                    <button
                      type="button"
                      onClick={() => setSelectedFood(null)}
                      className="text-xs text-gray-400 hover:text-white"
                    >
                      ✕
                    </button>
                  </div>

                  <div className="mb-3 flex gap-2">
                    <div className="flex-1">
                      <label className="mb-1 block text-xs text-gray-400">Quantity</label>
                      <input
                        type="number"
                        min={0.25}
                        step={0.25}
                        value={ingredientQty}
                        onChange={(e) => {
                          const v = parseFloat(e.target.value);
                          if (!isNaN(v) && v > 0) setIngredientQty(v);
                        }}
                        className="w-full rounded border border-gray-600 bg-surface px-2 py-1.5 text-sm text-white focus:ring-1 focus:ring-secondary focus:outline-none"
                      />
                    </div>
                    <div className="flex-1">
                      <label className="mb-1 block text-xs text-gray-400">Unit</label>
                      <input
                        type="text"
                        value={ingredientUnit}
                        onChange={(e) => setIngredientUnit(e.target.value)}
                        placeholder="serving"
                        className="w-full rounded border border-gray-600 bg-surface px-2 py-1.5 text-sm text-white placeholder:text-gray-500 focus:ring-1 focus:ring-secondary focus:outline-none"
                      />
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={handleAddIngredient}
                    className="w-full rounded-lg bg-secondary px-3 py-2 text-sm font-medium text-white hover:bg-secondary/80"
                  >
                    Add to Recipe
                  </button>
                </>
              )}
            </div>
          )}
        </section>
      )}

      {/* Direct Nutrients Mode */}
      {directMode && (
        <section className="mb-5">
          <label className="mb-2 block text-sm font-semibold text-white">
            Nutrients per Serving
          </label>
          <div className="space-y-2 rounded-lg border border-gray-700 bg-surface p-3">
            {SUPPORTED_NUTRIENTS.map((n) => (
              <div key={n.id} className="flex items-center gap-3">
                <span className="w-28 shrink-0 text-sm text-gray-300">{n.name}</span>
                <input
                  type="number"
                  min={0}
                  step="any"
                  value={directNutrients[n.id]}
                  onChange={(e) =>
                    setDirectNutrients((prev) => ({ ...prev, [n.id]: e.target.value }))
                  }
                  placeholder="0"
                  className="w-24 rounded border border-gray-600 bg-surface-elevated px-2 py-1.5 text-sm text-white placeholder:text-gray-500 focus:ring-1 focus:ring-secondary focus:outline-none"
                />
                <span className="text-xs text-gray-500">{n.unit}</span>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Nutrient Summary Preview */}
      {nutrientSummary.length > 0 && (
        <section className="mb-6">
          <label className="mb-1.5 block text-sm font-semibold text-white">
            Nutrient Preview <span className="font-normal text-gray-400">(per serving)</span>
          </label>
          <div className="rounded-lg border border-gray-700 bg-surface p-3">
            <div className="grid grid-cols-2 gap-x-4 gap-y-1.5">
              {nutrientSummary.map((n) => {
                const { name: nName, unit } = nutrientLabel(n.nutrientId);
                return (
                  <div key={n.nutrientId} className="flex items-baseline justify-between text-sm">
                    <span className="text-gray-400">{nName}</span>
                    <span className="font-mono text-white">
                      {n.amount}
                      <span className="ml-0.5 text-xs text-gray-500">{unit}</span>
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        </section>
      )}

      {/* Action buttons */}
      <div className="space-y-3">
        {/* Save */}
        <button
          type="button"
          onClick={handleSubmit}
          disabled={!canSubmit}
          className="w-full rounded-lg bg-secondary px-4 py-3 text-center text-sm font-semibold text-white transition-colors hover:bg-secondary/80 disabled:cursor-not-allowed disabled:opacity-40"
        >
          {updateRecipe.isPending ? (
            <span className="flex items-center justify-center gap-2">
              <Loader2 className="h-4 w-4 animate-spin" />
              Saving…
            </span>
          ) : (
            'Save Changes'
          )}
        </button>

        {/* Delete */}
        {!showDeleteConfirm ? (
          <button
            type="button"
            onClick={() => setShowDeleteConfirm(true)}
            className="flex w-full items-center justify-center gap-2 rounded-lg border border-red-800 px-4 py-3 text-center text-sm font-medium text-red-400 transition-colors hover:bg-red-900/20"
          >
            <Trash2 className="h-4 w-4" />
            Delete Recipe
          </button>
        ) : (
          <div className="rounded-lg border border-red-700 bg-red-900/20 p-4">
            <p className="mb-3 text-center text-sm text-red-300">
              Are you sure? This cannot be undone.
            </p>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setShowDeleteConfirm(false)}
                className="flex-1 rounded-lg border border-gray-600 px-3 py-2 text-sm text-gray-300 hover:bg-surface-elevated"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleDelete}
                disabled={deleteRecipe.isPending}
                className="flex-1 rounded-lg bg-red-700 px-3 py-2 text-sm font-medium text-white hover:bg-red-600 disabled:opacity-50"
              >
                {deleteRecipe.isPending ? (
                  <span className="flex items-center justify-center gap-2">
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Deleting…
                  </span>
                ) : (
                  'Yes, Delete'
                )}
              </button>
            </div>
          </div>
        )}
      </div>
    </main>
  );
}
