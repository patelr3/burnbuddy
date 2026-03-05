import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { calculateStreaks } from './streak-calculator';
import type { GroupWorkout } from '@burnbuddy/shared';

/** Builds a GroupWorkout stub for a given UTC date string (YYYY-MM-DD). */
function makeGroupWorkout(
  date: string,
  overrides: Partial<GroupWorkout> = {},
): GroupWorkout {
  return {
    id: `gw-${date}`,
    type: 'buddy',
    referenceId: 'buddy-1',
    memberUids: ['user-a', 'user-b'],
    startedAt: `${date}T10:00:00.000Z`,
    workoutIds: ['w1', 'w2'],
    ...overrides,
  };
}

/** Returns the UTC date string for today minus `daysAgo` days. */
function daysAgoStr(daysAgo: number): string {
  return new Date(Date.now() - daysAgo * 86_400_000).toISOString().substring(0, 10);
}

describe('calculateStreaks', () => {
  // Pin Date.now() so tests are deterministic regardless of when they run
  const FIXED_NOW = new Date('2026-03-02T12:00:00.000Z').getTime();

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(FIXED_NOW);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('returns 0 for both streaks when there are no group workouts', () => {
    expect(calculateStreaks([])).toEqual({ burnStreak: 0, supernovaStreak: 0 });
  });

  it('counts today as day 1 when a group workout exists today', () => {
    const groupWorkouts = [makeGroupWorkout(daysAgoStr(0))];
    expect(calculateStreaks(groupWorkouts)).toEqual({ burnStreak: 1, supernovaStreak: 1 });
  });

  it('returns 0 when the most recent group workout was 2 days ago (gap yesterday)', () => {
    const groupWorkouts = [makeGroupWorkout(daysAgoStr(2))];
    expect(calculateStreaks(groupWorkouts)).toEqual({ burnStreak: 0, supernovaStreak: 0 });
  });

  it('accumulates streak across consecutive days', () => {
    const groupWorkouts = [
      makeGroupWorkout(daysAgoStr(0)),
      makeGroupWorkout(daysAgoStr(1)),
      makeGroupWorkout(daysAgoStr(2)),
    ];
    expect(calculateStreaks(groupWorkouts)).toEqual({ burnStreak: 3, supernovaStreak: 3 });
  });

  it('stops counting after first missing day', () => {
    // Today and 3 days ago, but 1 and 2 days ago missing
    const groupWorkouts = [
      makeGroupWorkout(daysAgoStr(0)),
      makeGroupWorkout(daysAgoStr(3)),
    ];
    expect(calculateStreaks(groupWorkouts)).toEqual({ burnStreak: 1, supernovaStreak: 1 });
  });

  it('handles multiple group workouts on the same day', () => {
    const groupWorkouts = [
      makeGroupWorkout(daysAgoStr(0), { id: 'gw-1' }),
      makeGroupWorkout(daysAgoStr(0), { id: 'gw-2' }),
      makeGroupWorkout(daysAgoStr(1)),
    ];
    expect(calculateStreaks(groupWorkouts)).toEqual({ burnStreak: 2, supernovaStreak: 2 });
  });

  it('works with squad-type group workouts', () => {
    const groupWorkouts = [
      makeGroupWorkout(daysAgoStr(0), {
        type: 'squad',
        referenceId: 'squad-1',
        memberUids: ['user-a', 'user-b', 'user-c'],
      }),
      makeGroupWorkout(daysAgoStr(1), {
        type: 'squad',
        referenceId: 'squad-1',
        memberUids: ['user-a', 'user-b', 'user-c'],
      }),
    ];
    expect(calculateStreaks(groupWorkouts)).toEqual({ burnStreak: 2, supernovaStreak: 2 });
  });

  it('streak increments on unscheduled workout days', () => {
    // Group workouts can happen any day — no schedule dependency.
    // Mon 2026-03-02, Sat 2026-02-28, Thu 2026-02-26 — no schedule pattern required
    const groupWorkouts = [
      makeGroupWorkout(daysAgoStr(0)), // today (Mon)
      makeGroupWorkout(daysAgoStr(1)), // yesterday (Sun)
      makeGroupWorkout(daysAgoStr(2)), // Sat
    ];
    expect(calculateStreaks(groupWorkouts)).toEqual({ burnStreak: 3, supernovaStreak: 3 });
  });

  it('streak increments when workouts overlap within 20 min but outside schedule', () => {
    // GroupWorkout documents are created by the 20-min overlap detection.
    // Streak calculator doesn't check schedules — it just counts days with GroupWorkouts.
    // These group workouts exist regardless of what the schedule says.
    const groupWorkouts = [
      makeGroupWorkout(daysAgoStr(0)),
      makeGroupWorkout(daysAgoStr(1)),
    ];
    expect(calculateStreaks(groupWorkouts)).toEqual({ burnStreak: 2, supernovaStreak: 2 });
  });

  it('burnStreak and supernovaStreak are always equal (group workouts imply all members)', () => {
    const groupWorkouts = [
      makeGroupWorkout(daysAgoStr(0)),
      makeGroupWorkout(daysAgoStr(1)),
      makeGroupWorkout(daysAgoStr(2)),
      makeGroupWorkout(daysAgoStr(3)),
      makeGroupWorkout(daysAgoStr(4)),
    ];
    const result = calculateStreaks(groupWorkouts);
    expect(result.burnStreak).toBe(result.supernovaStreak);
    expect(result.burnStreak).toBe(5);
  });
});
