import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { calculateStreaks, calculateHighestStreakEver, calculateGroupStats } from './streak-calculator';
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

  it('preserves streak when the most recent group workout was 2 days ago (gap < 7 days)', () => {
    const groupWorkouts = [makeGroupWorkout(daysAgoStr(2))];
    expect(calculateStreaks(groupWorkouts)).toEqual({ burnStreak: 1, supernovaStreak: 1 });
  });

  it('accumulates streak across consecutive days', () => {
    const groupWorkouts = [
      makeGroupWorkout(daysAgoStr(0)),
      makeGroupWorkout(daysAgoStr(1)),
      makeGroupWorkout(daysAgoStr(2)),
    ];
    expect(calculateStreaks(groupWorkouts)).toEqual({ burnStreak: 3, supernovaStreak: 3 });
  });

  it('counts across short gaps (gap of 2 days between workout days)', () => {
    // Today and 3 days ago, but 1 and 2 days ago missing (2-day gap < 7)
    const groupWorkouts = [
      makeGroupWorkout(daysAgoStr(0)),
      makeGroupWorkout(daysAgoStr(3)),
    ];
    expect(calculateStreaks(groupWorkouts)).toEqual({ burnStreak: 2, supernovaStreak: 2 });
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

  // --- US-002: 7-day inactivity window tests ---

  it('streak survives a 6-day gap', () => {
    // Workouts on day 0 and day 7 (6-day gap between them: days 1-6 missing)
    const groupWorkouts = [
      makeGroupWorkout(daysAgoStr(0)),
      makeGroupWorkout(daysAgoStr(7)),
    ];
    expect(calculateStreaks(groupWorkouts)).toEqual({ burnStreak: 2, supernovaStreak: 2 });
  });

  it('streak resets on a 7-day gap', () => {
    // Workouts on day 0 and day 8 (7-day gap between them: days 1-7 missing)
    const groupWorkouts = [
      makeGroupWorkout(daysAgoStr(0)),
      makeGroupWorkout(daysAgoStr(8)),
    ];
    expect(calculateStreaks(groupWorkouts)).toEqual({ burnStreak: 1, supernovaStreak: 1 });
  });

  it('streak survives multiple short gaps', () => {
    // Workouts spread out with gaps of 3-5 days each — all < 7
    const groupWorkouts = [
      makeGroupWorkout(daysAgoStr(0)),   // today
      makeGroupWorkout(daysAgoStr(4)),   // 4-day gap (days 1-3 missing)
      makeGroupWorkout(daysAgoStr(10)),  // 6-day gap (days 5-9 missing, largest allowed)
      makeGroupWorkout(daysAgoStr(13)),  // 3-day gap (days 11-12 missing)
    ];
    expect(calculateStreaks(groupWorkouts)).toEqual({ burnStreak: 4, supernovaStreak: 4 });
  });

  it('streak resets to 0 when no workout in the last 7 days', () => {
    // Most recent workout was 7 days ago — leading gap of 7 days from today
    const groupWorkouts = [
      makeGroupWorkout(daysAgoStr(7)),
      makeGroupWorkout(daysAgoStr(8)),
    ];
    expect(calculateStreaks(groupWorkouts)).toEqual({ burnStreak: 0, supernovaStreak: 0 });
  });
});

describe('calculateHighestStreakEver', () => {
  it('returns 0 when there are no group workouts', () => {
    expect(calculateHighestStreakEver([])).toEqual({ value: 0, date: '' });
  });

  it('returns 1 for a single group workout', () => {
    const result = calculateHighestStreakEver([makeGroupWorkout('2026-01-15')]);
    expect(result).toEqual({ value: 1, date: '2026-01-15' });
  });

  it('counts consecutive days as a streak', () => {
    const groupWorkouts = [
      makeGroupWorkout('2026-01-10'),
      makeGroupWorkout('2026-01-11'),
      makeGroupWorkout('2026-01-12'),
    ];
    expect(calculateHighestStreakEver(groupWorkouts).value).toBe(3);
    expect(calculateHighestStreakEver(groupWorkouts).date).toBe('2026-01-12');
  });

  it('tolerates gaps of up to 6 days', () => {
    const groupWorkouts = [
      makeGroupWorkout('2026-01-01'),
      makeGroupWorkout('2026-01-07'), // 5-day gap (tolerated)
    ];
    expect(calculateHighestStreakEver(groupWorkouts).value).toBe(2);
  });

  it('resets on 7+ day gap and returns the peak', () => {
    const groupWorkouts = [
      makeGroupWorkout('2026-01-01'),
      makeGroupWorkout('2026-01-02'),
      makeGroupWorkout('2026-01-03'),
      // 7-day gap — streak resets
      makeGroupWorkout('2026-01-11'),
      makeGroupWorkout('2026-01-12'),
    ];
    const result = calculateHighestStreakEver(groupWorkouts);
    expect(result.value).toBe(3);
    expect(result.date).toBe('2026-01-03');
  });

  it('returns latest peak when multiple streaks tie', () => {
    const groupWorkouts = [
      makeGroupWorkout('2026-01-01'),
      makeGroupWorkout('2026-01-02'),
      // 7-day gap
      makeGroupWorkout('2026-01-10'),
      makeGroupWorkout('2026-01-11'),
      makeGroupWorkout('2026-01-12'),
    ];
    const result = calculateHighestStreakEver(groupWorkouts);
    expect(result.value).toBe(3);
    expect(result.date).toBe('2026-01-12');
  });
});

describe('calculateGroupStats', () => {
  const FIXED_NOW = new Date('2026-03-02T12:00:00.000Z').getTime();

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(FIXED_NOW);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('returns empty stats when there are no group workouts', () => {
    const stats = calculateGroupStats([]);
    expect(stats).toEqual({
      highestStreakEver: { value: 0, date: '' },
      firstGroupWorkoutDate: null,
      groupWorkoutsAllTime: 0,
      groupWorkoutsThisMonth: 0,
    });
  });

  it('calculates all stats correctly', () => {
    const groupWorkouts = [
      makeGroupWorkout('2026-02-28'),
      makeGroupWorkout('2026-03-01'),
      makeGroupWorkout('2026-03-02'),
    ];
    const stats = calculateGroupStats(groupWorkouts);
    expect(stats.highestStreakEver.value).toBe(3);
    expect(stats.firstGroupWorkoutDate).toBe('2026-02-28T10:00:00.000Z');
    expect(stats.groupWorkoutsAllTime).toBe(3);
    expect(stats.groupWorkoutsThisMonth).toBe(2); // only March workouts
  });
});
