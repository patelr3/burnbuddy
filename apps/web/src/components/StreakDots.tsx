'use client';

import { useState, useEffect, useRef, useId } from 'react';
import type { StreakDayInfo } from '@burnbuddy/shared';

export const BURN_STREAK_TOOLTIP =
  'Your burn streak counts workout days. It stays alive as long as you work out at least once a week (gap of 6 days max).';
export const SUPERNOVA_STREAK_TOOLTIP =
  'Your supernova streak rewards near-daily effort. It stays alive as long as you don\'t miss more than 1 day in a row.';

interface StreakDotsProps {
  streakCount: number;
  last7Days: StreakDayInfo[];
  color: 'orange' | 'violet';
  label: string;
  tooltip?: string;
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

export function StreakDots({ streakCount, last7Days, color, label, tooltip }: StreakDotsProps) {
  const [showTooltip, setShowTooltip] = useState(false);
  const cardRef = useRef<HTMLDivElement>(null);
  const tooltipId = useId();

  const days = last7Days.length > 0 ? last7Days : EMPTY_DAYS;
  const count = last7Days.length > 0 ? streakCount : 0;
  const danger = isDangerState(last7Days);
  const colorClass = COLOR_CLASSES[color];

  useEffect(() => {
    if (!showTooltip) return;

    function handleClickOutside(e: MouseEvent) {
      if (cardRef.current && !cardRef.current.contains(e.target as Node)) {
        setShowTooltip(false);
      }
    }

    function handleEscape(e: KeyboardEvent) {
      if (e.key === 'Escape') setShowTooltip(false);
    }

    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('keydown', handleEscape);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleEscape);
    };
  }, [showTooltip]);

  return (
    <div ref={cardRef} className="relative">
      <div
        className={`rounded-lg border bg-surface px-4 py-3.5 ${
          tooltip ? 'cursor-pointer border-gray-700 hover:border-gray-500 transition-colors' : 'border-gray-700'
        }`}
        onClick={tooltip ? () => setShowTooltip((prev) => !prev) : undefined}
        aria-describedby={tooltip && showTooltip ? tooltipId : undefined}
      >
        {/* Streak label + count */}
        <div className={`mb-2 flex items-center gap-1.5 text-sm font-semibold whitespace-nowrap ${danger ? 'text-red-500' : colorClass}`}>
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

      {/* Tooltip popover */}
      {tooltip && showTooltip && (
        <div
          id={tooltipId}
          role="tooltip"
          className="absolute left-1/2 z-50 mt-2 max-w-[280px] -translate-x-1/2 rounded-lg bg-gray-800 px-3 py-2 text-xs leading-relaxed text-gray-100 shadow-lg"
        >
          {/* Caret arrow pointing up */}
          <div className="absolute -top-1.5 left-1/2 -translate-x-1/2 border-[6px] border-transparent border-b-gray-800" />
          {tooltip}
        </div>
      )}
    </div>
  );
}
