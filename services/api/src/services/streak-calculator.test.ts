import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { calculateStreaks } from './streak-calculator';
import type { Workout } from '@burnbuddy/shared';

const UID_A = 'user-a';
const UID_B = 'user-b';
const UID_C = 'user-c';

/** Builds a completed Workout stub for a given UTC date string (YYYY-MM-DD). */
function makeWorkout(uid: string, endedAt: string): Workout {
  return {
    id: `workout-${uid}-${endedAt}`,
    uid,
    type: 'Running',
    startedAt: `${endedAt}T10:00:00.000Z`,
    endedAt: `${endedAt}T11:00:00.000Z`,
    status: 'completed',
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

  it('returns 0 for both streaks when there are no workouts', () => {
    expect(calculateStreaks([UID_A, UID_B], [])).toEqual({ burnStreak: 0, supernovaStreak: 0 });
  });

  it('returns 0 for both streaks when memberUids is empty', () => {
    expect(calculateStreaks([], [makeWorkout(UID_A, daysAgoStr(0))])).toEqual({
      burnStreak: 0,
      supernovaStreak: 0,
    });
  });

  it('counts today as day 1 when any member worked out today', () => {
    const workouts = [makeWorkout(UID_A, daysAgoStr(0))];
    const result = calculateStreaks([UID_A, UID_B], workouts);
    expect(result.burnStreak).toBe(1);
    expect(result.supernovaStreak).toBe(0); // UID_B did not work out
  });

  it('burnStreak and supernovaStreak are both 1 when all members worked out today only', () => {
    const workouts = [makeWorkout(UID_A, daysAgoStr(0)), makeWorkout(UID_B, daysAgoStr(0))];
    expect(calculateStreaks([UID_A, UID_B], workouts)).toEqual({ burnStreak: 1, supernovaStreak: 1 });
  });

  it('resets both streaks to 0 when the most recent workout was 2 days ago', () => {
    // Yesterday (1 day ago) is missing — streak is broken immediately
    const workouts = [makeWorkout(UID_A, daysAgoStr(2)), makeWorkout(UID_B, daysAgoStr(2))];
    expect(calculateStreaks([UID_A, UID_B], workouts)).toEqual({ burnStreak: 0, supernovaStreak: 0 });
  });

  it('accumulates burnStreak across consecutive days (any member)', () => {
    // UID_A worked out today, yesterday, and 2 days ago; UID_B only today
    const workouts = [
      makeWorkout(UID_A, daysAgoStr(0)),
      makeWorkout(UID_A, daysAgoStr(1)),
      makeWorkout(UID_A, daysAgoStr(2)),
      makeWorkout(UID_B, daysAgoStr(0)),
    ];
    const result = calculateStreaks([UID_A, UID_B], workouts);
    expect(result.burnStreak).toBe(3); // any member on all 3 days
    expect(result.supernovaStreak).toBe(1); // both members only today
  });

  it('accumulates supernovaStreak when all members worked out on consecutive days', () => {
    // Both worked out today, yesterday, 2 days ago; UID_A skipped 3 days ago
    const workouts = [
      makeWorkout(UID_A, daysAgoStr(0)),
      makeWorkout(UID_B, daysAgoStr(0)),
      makeWorkout(UID_A, daysAgoStr(1)),
      makeWorkout(UID_B, daysAgoStr(1)),
      makeWorkout(UID_A, daysAgoStr(2)),
      makeWorkout(UID_B, daysAgoStr(2)),
      makeWorkout(UID_B, daysAgoStr(3)), // UID_A missing — supernova breaks here
    ];
    expect(calculateStreaks([UID_A, UID_B], workouts)).toEqual({ burnStreak: 4, supernovaStreak: 3 });
  });

  it('handles a 3-member group correctly', () => {
    // All 3 worked out today and yesterday; UID_C missing 2 days ago
    const workouts = [
      makeWorkout(UID_A, daysAgoStr(0)),
      makeWorkout(UID_B, daysAgoStr(0)),
      makeWorkout(UID_C, daysAgoStr(0)),
      makeWorkout(UID_A, daysAgoStr(1)),
      makeWorkout(UID_B, daysAgoStr(1)),
      makeWorkout(UID_C, daysAgoStr(1)),
      makeWorkout(UID_A, daysAgoStr(2)),
      makeWorkout(UID_B, daysAgoStr(2)),
      // UID_C missing 2 days ago
    ];
    const result = calculateStreaks([UID_A, UID_B, UID_C], workouts);
    expect(result.burnStreak).toBe(3); // at least one member on day 2 → keeps going
    expect(result.supernovaStreak).toBe(2); // all three only today + yesterday
  });

  it('uses endedAt (not startedAt) for calendar day grouping', () => {
    // Workout started yesterday but ended today
    const workout: Workout = {
      id: 'w1',
      uid: UID_A,
      type: 'Running',
      startedAt: `${daysAgoStr(1)}T23:30:00.000Z`, // yesterday
      endedAt: `${daysAgoStr(0)}T00:30:00.000Z`, // today (UTC)
      status: 'completed',
    };
    const result = calculateStreaks([UID_A], [workout]);
    expect(result.burnStreak).toBe(1); // counted on today's date
  });

  it('counts single-member group correctly', () => {
    const workouts = [
      makeWorkout(UID_A, daysAgoStr(0)),
      makeWorkout(UID_A, daysAgoStr(1)),
      makeWorkout(UID_A, daysAgoStr(2)),
    ];
    expect(calculateStreaks([UID_A], workouts)).toEqual({ burnStreak: 3, supernovaStreak: 3 });
  });

  it('stops counting burnStreak after first missing day', () => {
    // Today and 3 days ago, but 1 and 2 days ago are missing
    const workouts = [makeWorkout(UID_A, daysAgoStr(0)), makeWorkout(UID_A, daysAgoStr(3))];
    expect(calculateStreaks([UID_A], workouts)).toEqual({ burnStreak: 1, supernovaStreak: 1 });
  });
});
