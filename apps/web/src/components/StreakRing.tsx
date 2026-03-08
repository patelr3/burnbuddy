'use client';

import Link from 'next/link';
import type { StreakDayInfo } from '@burnbuddy/shared';

interface StreakRingProps {
  streakCount: number;
  last7Days: StreakDayInfo[];
  color: 'orange' | 'violet';
  label: string;
  description: string;
  basePath: string;
}

const COLORS = {
  orange: { fill: '#FF9500', dim: 'rgba(255, 149, 0, 0.2)' },
  violet: { fill: '#8b5cf6', dim: 'rgba(139, 92, 246, 0.2)' },
} as const;

const SIZE = 112;
const CENTER = SIZE / 2;
const OUTER_R = 48;
const INNER_R = 32;
const GAP_DEG = 4;
const SEGMENT_DEG = (360 - 7 * GAP_DEG) / 7;

function polarToCartesian(cx: number, cy: number, r: number, deg: number) {
  const rad = ((deg - 90) * Math.PI) / 180;
  return { x: cx + r * Math.cos(rad), y: cy + r * Math.sin(rad) };
}

function arcSegmentPath(startDeg: number, endDeg: number): string {
  const outerStart = polarToCartesian(CENTER, CENTER, OUTER_R, startDeg);
  const outerEnd = polarToCartesian(CENTER, CENTER, OUTER_R, endDeg);
  const innerStart = polarToCartesian(CENTER, CENTER, INNER_R, endDeg);
  const innerEnd = polarToCartesian(CENTER, CENTER, INNER_R, startDeg);
  const largeArc = endDeg - startDeg > 180 ? 1 : 0;
  return [
    `M ${outerStart.x} ${outerStart.y}`,
    `A ${OUTER_R} ${OUTER_R} 0 ${largeArc} 1 ${outerEnd.x} ${outerEnd.y}`,
    `L ${innerStart.x} ${innerStart.y}`,
    `A ${INNER_R} ${INNER_R} 0 ${largeArc} 0 ${innerEnd.x} ${innerEnd.y}`,
    'Z',
  ].join(' ');
}

function SegmentLabel({ startDeg, endDeg, dayLabel }: { startDeg: number; endDeg: number; dayLabel: string }) {
  const midDeg = (startDeg + endDeg) / 2;
  const midR = (OUTER_R + INNER_R) / 2;
  const pos = polarToCartesian(CENTER, CENTER, midR, midDeg);
  return (
    <text
      x={pos.x}
      y={pos.y}
      textAnchor="middle"
      dominantBaseline="central"
      className="fill-white text-[8px] font-medium pointer-events-none select-none"
    >
      {dayLabel}
    </text>
  );
}

export function StreakRing({ streakCount, last7Days, color, label, description, basePath }: StreakRingProps) {
  const palette = COLORS[color];

  const segments = last7Days.map((day, i) => {
    const startDeg = i * (SEGMENT_DEG + GAP_DEG);
    const endDeg = startDeg + SEGMENT_DEG;
    const path = arcSegmentPath(startDeg, endDeg);
    const fill = day.hasWorkout ? palette.fill : palette.dim;
    const isClickable = day.hasWorkout && day.groupWorkoutId;

    const segmentElement = (
      <g key={day.date}>
        <path
          d={path}
          fill={fill}
          className={isClickable ? 'cursor-pointer hover:brightness-125 transition-all' : ''}
        />
        <SegmentLabel startDeg={startDeg} endDeg={endDeg} dayLabel={day.dayLabel} />
      </g>
    );

    if (isClickable) {
      return (
        <Link key={day.date} href={`${basePath}/group-workouts/${day.groupWorkoutId}`}>
          {segmentElement}
        </Link>
      );
    }
    return segmentElement;
  });

  return (
    <div className="flex flex-col items-center">
      <svg
        viewBox={`0 0 ${SIZE} ${SIZE}`}
        className="w-[100px] h-[100px] sm:w-[112px] sm:h-[112px]"
      >
        {segments}
        <text
          x={CENTER}
          y={CENTER}
          textAnchor="middle"
          dominantBaseline="central"
          className="fill-white text-[28px] font-bold"
        >
          {streakCount}
        </text>
      </svg>
      <StreakLabel label={label} description={description} />
    </div>
  );
}

function StreakLabel({ label, description }: { label: string; description: string }) {
  return (
    <div className="relative mt-1.5 group">
      <button
        type="button"
        className="flex items-center gap-1 text-xs text-gray-400 cursor-help"
      >
        {label}
        <svg
          viewBox="0 0 16 16"
          className="w-3.5 h-3.5 fill-gray-500"
          aria-label="Info"
        >
          <circle cx="8" cy="8" r="7.5" fill="none" stroke="currentColor" strokeWidth="1" />
          <text x="8" y="12" textAnchor="middle" fontSize="10" fill="currentColor" fontWeight="600">
            i
          </text>
        </svg>
      </button>
      <div
        role="tooltip"
        className="invisible group-hover:visible group-focus-within:visible absolute left-1/2 -translate-x-1/2 bottom-full mb-2 w-56 rounded-lg border border-gray-700 bg-gray-900 px-3 py-2 text-xs leading-relaxed text-gray-200 shadow-lg z-50 pointer-events-none"
      >
        {description}
        <div className="absolute left-1/2 -translate-x-1/2 top-full w-2 h-2 rotate-45 bg-gray-900 border-b border-r border-gray-700" />
      </div>
    </div>
  );
}
