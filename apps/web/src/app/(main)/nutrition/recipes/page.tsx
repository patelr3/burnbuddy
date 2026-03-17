'use client';

import { useMemo } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/lib/auth-context';
import { useRecipes } from '@/lib/nutrition-queries';
import { SUPPORTED_NUTRIENTS } from '@burnbuddy/shared';
import type { Recipe, NutrientAmount, NutrientId } from '@burnbuddy/shared';
import { Plus, BookOpen } from 'lucide-react';

const NUTRIENT_MAP = new Map(SUPPORTED_NUTRIENTS.map((n) => [n.id, n]));

/** Aggregate per-serving nutrient highlights from ingredients or directNutrients */
function getTopNutrients(recipe: Recipe): { nutrientId: NutrientId; amount: number }[] {
  const totals = new Map<NutrientId, number>();

  const sources: NutrientAmount[] = recipe.directNutrients?.length
    ? recipe.directNutrients
    : recipe.ingredients.flatMap((ing) => ing.nutrients);

  for (const n of sources) {
    totals.set(n.nutrientId, (totals.get(n.nutrientId) ?? 0) + n.amount);
  }

  const perServing = Array.from(totals.entries())
    .map(([nutrientId, total]) => ({
      nutrientId,
      amount: recipe.servings > 0 ? total / recipe.servings : total,
    }))
    .filter((n) => n.amount > 0)
    .sort((a, b) => {
      const aInfo = NUTRIENT_MAP.get(a.nutrientId);
      const bInfo = NUTRIENT_MAP.get(b.nutrientId);
      if (!aInfo || !bInfo) return 0;
      return b.amount / bInfo.dailyRecommended - a.amount / aInfo.dailyRecommended;
    });

  return perServing.slice(0, 3);
}

function RecipesSkeleton() {
  return (
    <div className="animate-pulse space-y-3">
      {[1, 2, 3].map((i) => (
        <div key={i} className="h-24 rounded-lg bg-gray-800" />
      ))}
    </div>
  );
}

interface RecipeCardProps {
  recipe: Recipe;
}

function RecipeCard({ recipe }: RecipeCardProps) {
  const router = useRouter();
  const topNutrients = useMemo(() => getTopNutrients(recipe), [recipe]);

  return (
    <button
      type="button"
      onClick={() => router.push(`/nutrition/recipes/${recipe.id}`)}
      className="w-full cursor-pointer rounded-lg border border-gray-700 bg-surface p-4 text-left transition-colors hover:bg-surface-elevated"
    >
      <div className="flex items-start justify-between">
        <div className="min-w-0 flex-1">
          <div className="truncate text-sm font-semibold text-white">{recipe.name}</div>
          <div className="mt-0.5 text-xs text-gray-400">
            {recipe.servings} serving{recipe.servings !== 1 ? 's' : ''}
            {recipe.ingredients.length > 0 && (
              <span> · {recipe.ingredients.length} ingredient{recipe.ingredients.length !== 1 ? 's' : ''}</span>
            )}
          </div>
        </div>
      </div>
      {topNutrients.length > 0 && (
        <div className="mt-2.5 flex flex-wrap gap-2">
          {topNutrients.map((n) => {
            const info = NUTRIENT_MAP.get(n.nutrientId);
            return info ? (
              <span
                key={n.nutrientId}
                className="rounded bg-surface-elevated px-2 py-0.5 text-xs text-gray-400"
              >
                {info.name}: {n.amount < 10 ? n.amount.toFixed(1) : Math.round(n.amount)}
                {info.unit}
              </span>
            ) : null;
          })}
        </div>
      )}
    </button>
  );
}

export default function RecipesPage() {
  const { loading } = useAuth();
  const { data: recipes, isLoading } = useRecipes();

  if (loading) return null;

  return (
    <main className="mx-auto max-w-xl px-4">
      {/* Header */}
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-lg font-bold text-white">My Recipes</h1>
        <Link
          href="/nutrition/recipes/new"
          className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-3 py-2 text-sm font-medium text-white no-underline hover:bg-primary/90"
        >
          <Plus className="h-4 w-4" />
          Create New Recipe
        </Link>
      </div>

      {isLoading ? (
        <RecipesSkeleton />
      ) : !recipes || recipes.length === 0 ? (
        /* Empty state */
        <div className="rounded-lg border border-gray-700 bg-surface p-8 text-center">
          <BookOpen className="mx-auto h-10 w-10 text-gray-600" />
          <div className="mt-3 text-sm font-medium text-gray-300">No recipes yet.</div>
          <div className="mt-1 text-xs text-gray-500">
            Create your first recipe to get started!
          </div>
          <Link
            href="/nutrition/recipes/new"
            className="mt-4 inline-flex items-center gap-1.5 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-white no-underline hover:bg-primary/90"
          >
            <Plus className="h-4 w-4" />
            Create Recipe
          </Link>
        </div>
      ) : (
        /* Recipe list */
        <div className="space-y-2">
          {recipes.map((recipe) => (
            <RecipeCard key={recipe.id} recipe={recipe} />
          ))}
        </div>
      )}
    </main>
  );
}
