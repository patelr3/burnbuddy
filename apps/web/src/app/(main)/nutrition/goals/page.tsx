'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowLeft, Check, Trophy, Info, Loader2 } from 'lucide-react';
import { SUPPORTED_NUTRIENTS, NutrientId } from '@burnbuddy/shared';
import { useNutritionGoals, useUpdateNutritionGoals } from '@/lib/nutrition-queries';

export default function NutritionGoalsPage() {
  const router = useRouter();
  const { data: goals, isLoading } = useNutritionGoals();
  const updateGoals = useUpdateNutritionGoals();

  const [selected, setSelected] = useState<NutrientId[]>([]);
  const [initialized, setInitialized] = useState(false);
  const [showSuccess, setShowSuccess] = useState(false);

  useEffect(() => {
    if (goals && !initialized) {
      setSelected(goals.targetNutrients ?? []);
      setInitialized(true);
    }
  }, [goals, initialized]);

  const toggleNutrient = (id: NutrientId) => {
    setSelected((prev) => {
      if (prev.includes(id)) return prev.filter((n) => n !== id);
      if (prev.length >= 3) return prev;
      return [...prev, id];
    });
  };

  const handleSave = () => {
    updateGoals.mutate(selected, {
      onSuccess: () => {
        setShowSuccess(true);
        setTimeout(() => setShowSuccess(false), 2000);
      },
    });
  };

  const hasChanges =
    initialized &&
    (selected.length !== (goals?.targetNutrients?.length ?? 0) ||
      selected.some((id) => !goals?.targetNutrients?.includes(id)));

  if (isLoading) return <GoalsSkeleton />;

  return (
    <main className="mx-auto max-w-xl px-4">
      {/* Header */}
      <div className="mb-6 flex items-center gap-3">
        <button
          onClick={() => router.push('/nutrition')}
          className="rounded-lg bg-surface p-2 text-gray-400 hover:text-white"
        >
          <ArrowLeft className="h-5 w-5" />
        </button>
        <h1 className="text-2xl font-bold text-white">Nutrition Goals</h1>
      </div>

      {/* Points explanation */}
      <div className="mb-6 rounded-xl border border-primary/30 bg-primary/10 p-4">
        <div className="mb-2 flex items-center gap-2">
          <Trophy className="h-5 w-5 text-primary" />
          <span className="font-semibold text-primary">How Points Work</span>
        </div>
        <p className="text-sm leading-relaxed text-gray-300">
          Choose up to <strong className="text-white">3 target nutrients</strong> to track daily.
          Earn <strong className="text-white">1 point</strong> for each target nutrient that reaches{' '}
          <strong className="text-white">100%</strong> of its daily recommended intake.
          Points add to your monthly total.
        </p>
      </div>

      {/* Selected targets */}
      {selected.length > 0 && (
        <div className="mb-6">
          <h2 className="mb-3 text-sm font-medium tracking-wide text-gray-400 uppercase">
            Your Targets ({selected.length}/3)
          </h2>
          <div className="flex flex-wrap gap-2">
            {selected.map((id) => {
              const nutrient = SUPPORTED_NUTRIENTS.find((n) => n.id === id);
              if (!nutrient) return null;
              return (
                <button
                  key={id}
                  onClick={() => toggleNutrient(id)}
                  className="flex items-center gap-2 rounded-full bg-primary/20 px-4 py-2 text-sm font-medium text-primary transition-colors hover:bg-primary/30"
                >
                  <Check className="h-4 w-4" />
                  {nutrient.name}
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* All nutrients list */}
      <div className="mb-6">
        <h2 className="mb-3 text-sm font-medium tracking-wide text-gray-400 uppercase">
          Available Nutrients
        </h2>
        <div className="space-y-2">
          {SUPPORTED_NUTRIENTS.map((nutrient) => {
            const isSelected = selected.includes(nutrient.id);
            const isDisabled = !isSelected && selected.length >= 3;

            return (
              <button
                key={nutrient.id}
                onClick={() => toggleNutrient(nutrient.id)}
                disabled={isDisabled}
                className={`flex w-full items-center justify-between rounded-xl border p-4 text-left transition-all ${
                  isSelected
                    ? 'border-primary/50 bg-primary/10'
                    : isDisabled
                      ? 'cursor-not-allowed border-gray-700/50 bg-surface/50 opacity-50'
                      : 'border-gray-700 bg-surface hover:border-gray-600'
                }`}
              >
                <div className="flex items-center gap-3">
                  <div
                    className={`flex h-6 w-6 items-center justify-center rounded-md border-2 transition-colors ${
                      isSelected
                        ? 'border-primary bg-primary'
                        : isDisabled
                          ? 'border-gray-600'
                          : 'border-gray-500'
                    }`}
                  >
                    {isSelected && <Check className="h-4 w-4 text-white" />}
                  </div>
                  <span className={`font-medium ${isSelected ? 'text-white' : 'text-gray-300'}`}>
                    {nutrient.name}
                  </span>
                </div>
                <span className="text-sm text-gray-400">
                  {nutrient.dailyRecommended} {nutrient.unit}/day
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Info note */}
      <div className="mb-6 flex items-start gap-2 rounded-lg bg-surface/50 p-3">
        <Info className="mt-0.5 h-4 w-4 shrink-0 text-gray-500" />
        <p className="text-xs text-gray-500">
          Daily recommended values are general guidelines. Consult a healthcare provider for
          personalized nutrition advice.
        </p>
      </div>

      {/* Save button */}
      <div className="pb-8">
        <button
          onClick={handleSave}
          disabled={updateGoals.isPending || showSuccess}
          className={`flex w-full items-center justify-center gap-2 rounded-xl px-6 py-3 font-semibold transition-all ${
            showSuccess
              ? 'bg-success text-white'
              : hasChanges
                ? 'bg-primary text-white hover:bg-primary/90'
                : 'bg-primary/80 text-white/80'
          }`}
        >
          {updateGoals.isPending ? (
            <>
              <Loader2 className="h-5 w-5 animate-spin" />
              Saving…
            </>
          ) : showSuccess ? (
            <>
              <Check className="h-5 w-5" />
              Goals Saved!
            </>
          ) : (
            'Save Goals'
          )}
        </button>
      </div>
    </main>
  );
}

function GoalsSkeleton() {
  return (
    <main className="mx-auto max-w-xl px-4">
      <div className="mb-6 flex items-center gap-3">
        <div className="h-9 w-9 animate-pulse rounded-lg bg-surface" />
        <div className="h-8 w-48 animate-pulse rounded-lg bg-surface" />
      </div>
      <div className="mb-6 h-28 animate-pulse rounded-xl bg-surface" />
      <div className="mb-3 h-5 w-40 animate-pulse rounded bg-surface" />
      <div className="space-y-2">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="h-16 animate-pulse rounded-xl bg-surface" />
        ))}
      </div>
    </main>
  );
}
