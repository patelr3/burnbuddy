'use client';

import { useState, useMemo } from 'react';
import { useAuth } from '@/lib/auth-context';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useLogSupplement } from '@/lib/nutrition-queries';
import {
  COMMON_SUPPLEMENTS,
  SUPPORTED_NUTRIENTS,
  type NutrientAmount,
  type Supplement,
  type NutrientId,
} from '@burnbuddy/shared';
import { ArrowLeft, Check, Loader2, Pill } from 'lucide-react';

function formatDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

const NUTRIENT_MAP = new Map(SUPPORTED_NUTRIENTS.map((n) => [n.id, n]));

function nutrientLabel(nId: string): { name: string; unit: string } {
  const info = NUTRIENT_MAP.get(nId as NutrientId);
  return info ? { name: info.name, unit: info.unit } : { name: nId, unit: '' };
}

type Mode = 'catalog' | 'custom';

export default function LogSupplementPage() {
  const { user, loading: authLoading } = useAuth();
  const router = useRouter();
  const logSupplement = useLogSupplement();

  const [mode, setMode] = useState<Mode>('catalog');
  const [date, setDate] = useState(formatDate(new Date()));
  const [selectedSupplement, setSelectedSupplement] = useState<Supplement | null>(null);

  // Custom supplement state
  const [customName, setCustomName] = useState('');
  const [customNutrients, setCustomNutrients] = useState<Record<string, string>>({});

  const [showSuccess, setShowSuccess] = useState(false);

  const customNutrientAmounts: NutrientAmount[] = useMemo(() => {
    return Object.entries(customNutrients)
      .filter(([, val]) => val.trim() !== '' && parseFloat(val) > 0)
      .map(([id, val]) => ({ nutrientId: id as NutrientId, amount: parseFloat(val) }));
  }, [customNutrients]);

  const supplementName = mode === 'catalog' ? (selectedSupplement?.name ?? '') : customName.trim();
  const nutrients = mode === 'catalog' ? (selectedSupplement?.nutrients ?? []) : customNutrientAmounts;
  const canSubmit = supplementName !== '' && nutrients.length > 0 && !logSupplement.isPending;

  const handleSelectCatalog = (supp: Supplement) => {
    setSelectedSupplement(supp);
  };

  const handleSubmit = async () => {
    if (!canSubmit) return;
    try {
      await logSupplement.mutateAsync({
        date,
        supplementName,
        nutrients,
      });
      setShowSuccess(true);
      setTimeout(() => router.push('/nutrition'), 800);
    } catch {
      // mutation error handled via logSupplement.error
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
        Please sign in to log supplements.
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
          <p className="text-lg font-semibold text-white">Supplement Logged!</p>
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
        <h1 className="text-xl font-bold text-white">Log a Supplement</h1>
      </div>

      {/* Error */}
      {logSupplement.error && (
        <div className="mb-4 rounded-lg border border-red-700 bg-red-900/30 px-4 py-3 text-sm text-red-300">
          {(logSupplement.error as Error).message || 'Failed to log supplement. Please try again.'}
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

      {/* Mode Toggle */}
      <section className="mb-6">
        <label className="mb-1.5 block text-sm font-semibold text-white">Source</label>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => {
              setMode('catalog');
              setCustomName('');
              setCustomNutrients({});
            }}
            className={`flex-1 rounded-lg border px-3 py-2 text-sm font-medium transition-colors ${
              mode === 'catalog'
                ? 'border-secondary bg-secondary/20 text-white'
                : 'border-gray-700 bg-surface text-gray-400 hover:bg-surface-elevated'
            }`}
          >
            💊 Common Supplements
          </button>
          <button
            type="button"
            onClick={() => {
              setMode('custom');
              setSelectedSupplement(null);
            }}
            className={`flex-1 rounded-lg border px-3 py-2 text-sm font-medium transition-colors ${
              mode === 'custom'
                ? 'border-secondary bg-secondary/20 text-white'
                : 'border-gray-700 bg-surface text-gray-400 hover:bg-surface-elevated'
            }`}
          >
            ✏️ Custom Supplement
          </button>
        </div>
      </section>

      {/* Catalog Supplements */}
      {mode === 'catalog' && (
        <section className="mb-6">
          <label className="mb-2 block text-sm font-semibold text-white">Select Supplement</label>
          <div className="grid grid-cols-2 gap-2">
            {COMMON_SUPPLEMENTS.map((supp) => {
              const isSelected = selectedSupplement?.id === supp.id;
              return (
                <button
                  key={supp.id}
                  type="button"
                  onClick={() => handleSelectCatalog(supp)}
                  className={`flex flex-col items-start gap-1 rounded-lg border p-3 text-left transition-colors ${
                    isSelected
                      ? 'border-secondary bg-secondary/20 text-white'
                      : 'border-gray-700 bg-surface text-gray-300 hover:bg-surface-elevated'
                  }`}
                >
                  <div className="flex w-full items-center justify-between">
                    <span className="text-sm font-medium">{supp.name}</span>
                    {isSelected && <Check className="h-4 w-4 text-secondary" />}
                  </div>
                  <span className="text-xs text-gray-400">
                    {supp.nutrients
                      .map((n) => {
                        const { name, unit } = nutrientLabel(n.nutrientId);
                        return `${name}: ${n.amount}${unit}`;
                      })
                      .join(', ')}
                  </span>
                </button>
              );
            })}
          </div>
        </section>
      )}

      {/* Custom Supplement Entry */}
      {mode === 'custom' && (
        <section className="mb-6">
          <label className="mb-1.5 block text-sm font-semibold text-white">Supplement Name</label>
          <input
            type="text"
            placeholder="e.g., Multivitamin, Biotin 5000mcg…"
            value={customName}
            onChange={(e) => setCustomName(e.target.value)}
            className="mb-4 w-full rounded-lg border border-gray-600 bg-surface-elevated px-3 py-2 text-white placeholder:text-gray-500 focus:ring-2 focus:ring-secondary focus:outline-none"
          />

          <label className="mb-2 block text-sm font-semibold text-white">
            Nutrient Amounts <span className="font-normal text-gray-400">(enter non-zero values)</span>
          </label>
          <div className="space-y-2 rounded-lg border border-gray-700 bg-surface p-3">
            {SUPPORTED_NUTRIENTS.map((nutrient) => (
              <div key={nutrient.id} className="flex items-center gap-3">
                <label className="w-28 shrink-0 text-sm text-gray-300">{nutrient.name}</label>
                <input
                  type="number"
                  min={0}
                  step="any"
                  placeholder="0"
                  value={customNutrients[nutrient.id] ?? ''}
                  onChange={(e) =>
                    setCustomNutrients((prev) => ({ ...prev, [nutrient.id]: e.target.value }))
                  }
                  className="w-24 rounded border border-gray-600 bg-surface-elevated px-2 py-1.5 text-sm text-white placeholder:text-gray-600 focus:ring-1 focus:ring-secondary focus:outline-none"
                />
                <span className="text-xs text-gray-500">{nutrient.unit}</span>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Nutrient Preview */}
      {nutrients.length > 0 && (
        <section className="mb-6">
          <label className="mb-1.5 block text-sm font-semibold text-white">Nutrient Preview</label>
          <div className="rounded-lg border border-gray-700 bg-surface p-3">
            <div className="grid grid-cols-2 gap-x-4 gap-y-1.5">
              {nutrients.map((n) => {
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
          </div>
        </section>
      )}

      {/* Submit */}
      <button
        type="button"
        onClick={handleSubmit}
        disabled={!canSubmit}
        className="w-full rounded-lg bg-secondary px-4 py-3 text-center text-sm font-semibold text-white transition-colors hover:bg-secondary/80 disabled:cursor-not-allowed disabled:opacity-40"
      >
        {logSupplement.isPending ? (
          <span className="flex items-center justify-center gap-2">
            <Loader2 className="h-4 w-4 animate-spin" />
            Logging…
          </span>
        ) : (
          'Log Supplement'
        )}
      </button>
    </main>
  );
}
