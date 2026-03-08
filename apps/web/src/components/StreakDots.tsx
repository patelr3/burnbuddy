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

function isDangerState(last7Days: StreakDayInfo[]): boolean {
  // Danger when the most recent 6 days (indices 1–6) all have no workout
  return last7Days.slice(1, 7).every((day) => !day.hasWorkout);
}

export function StreakDots({ streakCount, last7Days, color, label }: StreakDotsProps) {
  const danger = isDangerState(last7Days);
  const colorClass = COLOR_CLASSES[color];

  return (
    <div className="flex items-center gap-3">
      {/* Streak count + label */}
      <div className={`flex items-center gap-1.5 text-sm font-semibold whitespace-nowrap ${danger ? 'text-red-500' : colorClass}`}>
        <span>🔥</span>
        <span>{streakCount}</span>
        <span className="text-gray-400 font-normal">{label}</span>
      </div>

      {/* 7-dot streak indicator */}
      <div
        className="flex items-start gap-1.5"
        role="img"
        aria-label={`${label}: ${streakCount} day streak. ${last7Days.filter((d) => d.hasWorkout).length} of last 7 days with workouts.`}
      >
        {last7Days.map((day, i) => (
          <div key={day.date} className="flex flex-col items-center gap-0.5">
            <span
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
            <span
              className={`text-[10px] leading-none ${
                danger ? 'text-red-500' : 'text-gray-500'
              }`}
            >
              {day.dayLabel}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
