'use client';

import { useMonthlyPoints } from '@/lib/queries';

const MONTH_LABELS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

function monthLabel(month: string): string {
  const [, mm] = month.split('-');
  return MONTH_LABELS[parseInt(mm, 10) - 1] ?? month;
}

export function MonthlyPointsCard() {
  const { data, isLoading } = useMonthlyPoints();

  if (isLoading) {
    return (
      <div className="animate-pulse rounded-lg border border-gray-700 bg-surface px-4 py-4">
        <div className="mb-2 h-4 w-32 rounded bg-gray-800" />
        <div className="h-8 w-16 rounded bg-gray-800" />
      </div>
    );
  }

  const points = data?.currentMonth.points ?? 0;
  const history = data?.history?.slice(0, 5) ?? [];

  // Compute max for sparkline bar heights
  const allValues = [points, ...history.map((h) => h.points)];
  const maxPoints = Math.max(...allValues, 1);

  return (
    <div className="rounded-lg border border-gray-700 bg-surface px-4 py-4">
      <div className="mb-1 text-xs text-gray-400">Monthly Points</div>

      <div className="flex items-baseline gap-2">
        <span className="text-2xl font-bold text-primary">🔥 {points}</span>
      </div>

      {points === 0 && (
        <p className="mt-1 text-[12px] text-gray-500">
          Start a group workout to earn points!
        </p>
      )}

      {/* Mini bar chart of recent months */}
      {history.length > 0 && (
        <div className="mt-3 flex items-end gap-1.5">
          {[...history].reverse().map((h) => (
            <div key={h.month} className="flex flex-col items-center gap-0.5">
              <div
                className="w-5 rounded-sm bg-primary/40"
                style={{ height: `${Math.max((h.points / maxPoints) * 32, 3)}px` }}
                title={`${monthLabel(h.month)}: ${h.points} pts`}
              />
              <span className="text-[9px] text-gray-500">{monthLabel(h.month)}</span>
            </div>
          ))}
          {/* Current month bar */}
          <div className="flex flex-col items-center gap-0.5">
            <div
              className="w-5 rounded-sm bg-primary"
              style={{ height: `${Math.max((points / maxPoints) * 32, 3)}px` }}
              title={`This month: ${points} pts`}
            />
            <span className="text-[9px] font-bold text-primary">Now</span>
          </div>
        </div>
      )}
    </div>
  );
}
