'use client';

import type { StreakDayInfo } from '@burnbuddy/shared';

interface StreakDotsProps {
  streakCount: number;
  last7Days: StreakDayInfo[];
  color: 'orange' | 'violet';
  label: string;
}

const COLOR_CLASSES = {
  orange: 'text-primary',
  violet: 'text-violet-500',
} as const;

const EMPTY_DAYS: StreakDayInfo[] = Array.from({ length: 7 }, (_, i) => ({
  date: `empty-${i}`,
  dayLabel: '',
  hasWorkout: false,
  groupWorkoutId: null,
}));

function isDangerState(last7Days: StreakDayInfo[]): boolean {
  if (last7Days.length === 0) return false;
  return last7Days.slice(1, 7).every((day) => !day.hasWorkout);
}

export function StreakDots({ streakCount, last7Days, color, label }: StreakDotsProps) {
  const days = last7Days.length > 0 ? last7Days : EMPTY_DAYS;
  const count = last7Days.length > 0 ? streakCount : 0;
  const danger = isDangerState(last7Days);
  const colorClass = COLOR_CLASSES[color];

  return (
    <div className="rounded-lg border border-gray-700 bg-surface px-4 py-3.5">
      {/* Streak label + count */}
      <div className={`mb-2 flex items-center gap-1.5 text-sm font-semibold whitespace-nowrap ${danger ? 'text-red-500' : colorClass}`}>
        <span>🔥</span>
        <span>{count}</span>
        <span className="text-gray-400 font-normal">{label}</span>
      </div>

      {/* 7-dot streak indicator */}
      <div
        className="flex items-center gap-1.5"
        role="img"
        aria-label={`${label}: ${count} day streak. ${days.filter((d) => d.hasWorkout).length} of last 7 days with workouts.`}
      >
        {days.map((day) => (
          <span
            key={day.date}
            className={`text-base leading-none ${
              day.hasWorkout
                ? danger
                  ? 'text-red-500'
                  : ''
                : danger
                  ? 'text-red-500'
                  : 'text-gray-500'
            }`}
          >
            {day.hasWorkout ? '🔥' : '○'}
          </span>
        ))}
      </div>
    </div>
  );
}
