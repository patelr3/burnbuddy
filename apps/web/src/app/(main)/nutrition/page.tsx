'use client';

import { useState, useMemo } from 'react';
import Link from 'next/link';
import { useAuth } from '@/lib/auth-context';
import {
  useNutritionSummary,
  useNutritionMeals,
  useNutritionGoals,
} from '@/lib/nutrition-queries';
import { SUPPORTED_NUTRIENTS } from '@burnbuddy/shared';
import type { NutrientId, MealEntry, DailyNutritionSummary } from '@burnbuddy/shared';
import { ChevronLeft, ChevronRight, UtensilsCrossed, BookOpen, Target } from 'lucide-react';

function formatDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function displayDate(d: Date): string {
  const today = new Date();
  const yesterday = new Date();
  yesterday.setDate(today.getDate() - 1);
  if (formatDate(d) === formatDate(today)) return 'Today';
  if (formatDate(d) === formatDate(yesterday)) return 'Yesterday';
  return d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
}

function formatTime(iso: string): string {
  return new Date(iso).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
}

const NUTRIENT_MAP = new Map(SUPPORTED_NUTRIENTS.map((n) => [n.id, n]));

function progressColor(pct: number): string {
  if (pct >= 100) return 'bg-success';
  if (pct >= 50) return 'bg-yellow-500';
  return 'bg-danger';
}

function progressBarBg(pct: number): string {
  if (pct >= 100) return 'bg-success/20';
  if (pct >= 50) return 'bg-yellow-500/20';
  return 'bg-danger/20';
}

function NutritionSkeleton() {
  return (
    <div className="animate-pulse">
      <div className="mb-6 h-10 rounded-lg bg-gray-800" />
      <div className="mb-6 space-y-3">
        {[1, 2, 3].map((i) => (
          <div key={i} className="h-16 rounded-lg bg-gray-800" />
        ))}
      </div>
      <div className="mb-4 h-6 w-40 rounded bg-gray-800" />
      {[1, 2].map((i) => (
        <div key={i} className="mb-2 h-20 rounded-lg bg-gray-800" />
      ))}
    </div>
  );
}

interface TargetNutrientCardProps {
  nutrientId: NutrientId;
  consumed: number;
  recommended: number;
  percentComplete: number;
  earned: boolean;
}

function TargetNutrientCard({ nutrientId, consumed, recommended, percentComplete, earned }: TargetNutrientCardProps) {
  const info = NUTRIENT_MAP.get(nutrientId);
  if (!info) return null;
  const pct = Math.min(percentComplete, 100);

  return (
    <div className="rounded-lg border border-gray-700 bg-surface-elevated p-4">
      <div className="mb-2 flex items-center justify-between">
        <span className="text-sm font-semibold text-white">
          {earned && <span className="mr-1">🔥</span>}
          {info.name}
        </span>
        <span className="text-xs text-gray-400">
          {consumed.toFixed(1)} / {recommended} {info.unit}
        </span>
      </div>
      <div className={`h-3 w-full overflow-hidden rounded-full ${progressBarBg(percentComplete)}`}>
        <div
          className={`h-full rounded-full transition-all ${progressColor(percentComplete)}`}
          style={{ width: `${pct}%` }}
        />
      </div>
      <div className="mt-1 text-right text-xs text-gray-500">{percentComplete}%</div>
    </div>
  );
}

interface NutrientRowProps {
  nutrientId: NutrientId;
  consumed: number;
  recommended: number;
  percentComplete: number;
}

function NutrientRow({ nutrientId, consumed, recommended, percentComplete }: NutrientRowProps) {
  const info = NUTRIENT_MAP.get(nutrientId);
  if (!info) return null;
  const pct = Math.min(percentComplete, 100);

  return (
    <div className="flex items-center gap-3 py-2">
      <span className="w-24 shrink-0 text-sm text-gray-300">{info.name}</span>
      <div className={`h-2 flex-1 overflow-hidden rounded-full ${progressBarBg(percentComplete)}`}>
        <div
          className={`h-full rounded-full transition-all ${progressColor(percentComplete)}`}
          style={{ width: `${pct}%` }}
        />
      </div>
      <span className="w-28 shrink-0 text-right text-xs text-gray-400">
        {consumed.toFixed(1)} / {recommended} {info.unit}
      </span>
    </div>
  );
}

interface MealCardProps {
  meal: MealEntry;
}

function MealCard({ meal }: MealCardProps) {
  const mealTypeLabels: Record<string, string> = {
    breakfast: '🌅 Breakfast',
    lunch: '☀️ Lunch',
    dinner: '🌙 Dinner',
    snack: '🍎 Snack',
  };

  const topNutrients = meal.nutrients.slice(0, 3);

  return (
    <div className="rounded-lg border border-gray-700 bg-surface p-3.5">
      <div className="flex items-start justify-between">
        <div>
          <div className="text-sm font-semibold text-white">{meal.recipeName}</div>
          <div className="mt-0.5 text-xs text-gray-400">
            {mealTypeLabels[meal.mealType] ?? meal.mealType} · {formatTime(meal.createdAt)}
          </div>
        </div>
        {meal.servingsConsumed > 1 && (
          <span className="rounded-full bg-primary/20 px-2 py-0.5 text-xs text-primary">
            {meal.servingsConsumed} servings
          </span>
        )}
      </div>
      {topNutrients.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-2">
          {topNutrients.map((n) => {
            const info = NUTRIENT_MAP.get(n.nutrientId);
            return info ? (
              <span key={n.nutrientId} className="rounded bg-surface-elevated px-2 py-0.5 text-xs text-gray-400">
                {info.name}: {n.amount.toFixed(1)} {info.unit}
              </span>
            ) : null;
          })}
        </div>
      )}
    </div>
  );
}

export default function NutritionPage() {
  const { user, loading } = useAuth();
  const [selectedDate, setSelectedDate] = useState(() => new Date());

  const dateStr = formatDate(selectedDate);

  const { data: summary, isLoading: summaryLoading } = useNutritionSummary(dateStr);
  const { data: meals, isLoading: mealsLoading } = useNutritionMeals(dateStr);
  const { data: goals, isLoading: goalsLoading } = useNutritionGoals();

  const isLoading = summaryLoading || mealsLoading || goalsLoading;

  const goBack = () => {
    setSelectedDate((d) => {
      const prev = new Date(d);
      prev.setDate(prev.getDate() - 1);
      return prev;
    });
  };

  const goForward = () => {
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    setSelectedDate((d) => {
      const next = new Date(d);
      next.setDate(next.getDate() + 1);
      if (next > tomorrow) return d;
      return next;
    });
  };

  const isToday = formatDate(selectedDate) === formatDate(new Date());

  const targetNutrientIds = useMemo(() => new Set(goals?.targetNutrients ?? []), [goals]);

  const { targetNutrients, otherNutrients } = useMemo(() => {
    if (!summary) return { targetNutrients: [], otherNutrients: [] };
    const target = summary.nutrients.filter((n) => targetNutrientIds.has(n.nutrientId));
    const other = summary.nutrients.filter((n) => !targetNutrientIds.has(n.nutrientId));
    return { targetNutrients: target, otherNutrients: other };
  }, [summary, targetNutrientIds]);

  // Check if a nutrient earned a point (100%+ of daily recommended)
  const earnedNutrients = useMemo(() => {
    const set = new Set<NutrientId>();
    if (!summary) return set;
    for (const n of summary.nutrients) {
      if (targetNutrientIds.has(n.nutrientId) && n.percentComplete >= 100) {
        set.add(n.nutrientId);
      }
    }
    return set;
  }, [summary, targetNutrientIds]);

  if (loading) return null;

  return (
    <main className="mx-auto max-w-xl px-4">
      {/* Date Picker */}
      <div className="mb-6 flex items-center justify-between rounded-lg border border-gray-700 bg-surface px-4 py-3">
        <button
          onClick={goBack}
          className="cursor-pointer rounded-md p-1.5 text-gray-400 hover:bg-surface-elevated hover:text-white"
          aria-label="Previous day"
        >
          <ChevronLeft className="h-5 w-5" />
        </button>
        <span className="text-sm font-semibold text-white">{displayDate(selectedDate)}</span>
        <button
          onClick={goForward}
          disabled={isToday}
          className="cursor-pointer rounded-md p-1.5 text-gray-400 hover:bg-surface-elevated hover:text-white disabled:cursor-default disabled:opacity-30"
          aria-label="Next day"
        >
          <ChevronRight className="h-5 w-5" />
        </button>
      </div>

      {isLoading && !summary ? (
        <NutritionSkeleton />
      ) : (
        <>
          {/* No Goals Prompt */}
          {!goalsLoading && (!goals || goals.targetNutrients.length === 0) && (
            <Link
              href="/nutrition/goals"
              className="mb-6 block rounded-lg border border-accent-pink/30 bg-accent-pink/10 p-4 text-center no-underline"
            >
              <div className="text-lg">🎯</div>
              <div className="mt-1 text-sm font-semibold text-accent-pink">
                Choose up to 3 nutrients to track for points!
              </div>
              <div className="mt-1 text-xs text-gray-400">
                Set your nutrition goals to start earning points
              </div>
            </Link>
          )}

          {/* Points Banner */}
          {summary && summary.pointsEarned > 0 && (
            <div className="mb-6 rounded-lg border border-primary/30 bg-primary/10 px-4 py-3 text-center">
              <span className="text-lg font-bold text-primary">
                🔥 {summary.pointsEarned} point{summary.pointsEarned !== 1 ? 's' : ''} earned today!
              </span>
            </div>
          )}

          {/* Target Nutrients (prominent) */}
          {targetNutrients.length > 0 && (
            <section className="mb-6">
              <h2 className="mb-3 text-base font-semibold text-white">🎯 Target Nutrients</h2>
              <div className="space-y-2">
                {targetNutrients.map((n) => (
                  <TargetNutrientCard
                    key={n.nutrientId}
                    nutrientId={n.nutrientId}
                    consumed={n.consumed}
                    recommended={n.recommended}
                    percentComplete={n.percentComplete}
                    earned={earnedNutrients.has(n.nutrientId)}
                  />
                ))}
              </div>
            </section>
          )}

          {/* All Nutrients Summary */}
          {otherNutrients.length > 0 && (
            <section className="mb-6">
              <h2 className="mb-2 text-base font-semibold text-white">Daily Summary</h2>
              <div className="rounded-lg border border-gray-700 bg-surface px-4 py-2">
                {otherNutrients.map((n) => (
                  <NutrientRow
                    key={n.nutrientId}
                    nutrientId={n.nutrientId}
                    consumed={n.consumed}
                    recommended={n.recommended}
                    percentComplete={n.percentComplete}
                  />
                ))}
              </div>
            </section>
          )}

          {/* No summary at all (no meals logged, no targets) */}
          {summary && summary.nutrients.length === 0 && (
            <div className="mb-6 rounded-lg border border-gray-700 bg-surface p-6 text-center">
              <div className="text-2xl">🥗</div>
              <div className="mt-2 text-sm text-gray-400">No nutrition data for this day yet</div>
              <div className="mt-1 text-xs text-gray-500">Log a meal to start tracking</div>
            </div>
          )}

          {/* Quick Actions */}
          <section className="mb-6">
            <div className="grid grid-cols-3 gap-2">
              <Link
                href="/nutrition/meals"
                className="flex flex-col items-center gap-1.5 rounded-lg border border-gray-700 bg-surface p-3 no-underline hover:bg-surface-elevated"
              >
                <UtensilsCrossed className="h-5 w-5 text-primary" />
                <span className="text-xs font-medium text-gray-300">Log a Meal</span>
              </Link>
              <Link
                href="/nutrition/recipes"
                className="flex flex-col items-center gap-1.5 rounded-lg border border-gray-700 bg-surface p-3 no-underline hover:bg-surface-elevated"
              >
                <BookOpen className="h-5 w-5 text-secondary" />
                <span className="text-xs font-medium text-gray-300">My Recipes</span>
              </Link>
              <Link
                href="/nutrition/goals"
                className="flex flex-col items-center gap-1.5 rounded-lg border border-gray-700 bg-surface p-3 no-underline hover:bg-surface-elevated"
              >
                <Target className="h-5 w-5 text-accent-pink" />
                <span className="text-xs font-medium text-gray-300">Goals</span>
              </Link>
            </div>
          </section>

          {/* Today's Meals */}
          <section className="mb-6">
            <h2 className="mb-3 text-base font-semibold text-white">
              {isToday ? "Today's Meals" : 'Meals'}
            </h2>
            {!meals || meals.length === 0 ? (
              <div className="rounded-lg border border-gray-700 bg-surface p-4 text-center">
                <div className="text-sm text-gray-400">No meals logged</div>
                <Link
                  href="/nutrition/meals"
                  className="mt-2 inline-block text-xs font-medium text-primary no-underline hover:underline"
                >
                  Log your first meal →
                </Link>
              </div>
            ) : (
              <div className="space-y-2">
                {meals.map((meal) => (
                  <MealCard key={meal.id} meal={meal} />
                ))}
              </div>
            )}
          </section>
        </>
      )}
    </main>
  );
}
