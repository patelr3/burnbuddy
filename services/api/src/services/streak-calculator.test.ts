import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { calculateStreaks, calculateHighestStreakEver, calculateGroupStats } from './streak-calculator';
import type { GroupWorkout, StreakDayInfo } from '@burnbuddy/shared';

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
    expect(calculateStreaks([])).toMatchObject({ burnStreak: 0, supernovaStreak: 0 });
  });

  it('counts today as day 1 when a group workout exists today', () => {
    const groupWorkouts = [makeGroupWorkout(daysAgoStr(0))];
    expect(calculateStreaks(groupWorkouts)).toMatchObject({ burnStreak: 1, supernovaStreak: 1 });
  });

  it('preserves burnStreak but resets supernovaStreak when last workout was 2 days ago', () => {
    const groupWorkouts = [makeGroupWorkout(daysAgoStr(2))];
    expect(calculateStreaks(groupWorkouts)).toMatchObject({ burnStreak: 1, supernovaStreak: 0 });
  });

  it('accumulates streak across consecutive days', () => {
    const groupWorkouts = [
      makeGroupWorkout(daysAgoStr(0)),
      makeGroupWorkout(daysAgoStr(1)),
      makeGroupWorkout(daysAgoStr(2)),
    ];
    expect(calculateStreaks(groupWorkouts)).toMatchObject({ burnStreak: 3, supernovaStreak: 3 });
  });

  it('counts across short gaps (gap of 2 days between workout days)', () => {
    // Today and 3 days ago, but 1 and 2 days ago missing (2-day gap < 7 for burn, >= 2 for supernova)
    const groupWorkouts = [
      makeGroupWorkout(daysAgoStr(0)),
      makeGroupWorkout(daysAgoStr(3)),
    ];
    expect(calculateStreaks(groupWorkouts)).toMatchObject({ burnStreak: 2, supernovaStreak: 1 });
  });

  it('handles multiple group workouts on the same day', () => {
    const groupWorkouts = [
      makeGroupWorkout(daysAgoStr(0), { id: 'gw-1' }),
      makeGroupWorkout(daysAgoStr(0), { id: 'gw-2' }),
      makeGroupWorkout(daysAgoStr(1)),
    ];
    expect(calculateStreaks(groupWorkouts)).toMatchObject({ burnStreak: 2, supernovaStreak: 2 });
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
    expect(calculateStreaks(groupWorkouts)).toMatchObject({ burnStreak: 2, supernovaStreak: 2 });
  });

  it('streak increments on unscheduled workout days', () => {
    // Group workouts can happen any day — no schedule dependency.
    // Mon 2026-03-02, Sat 2026-02-28, Thu 2026-02-26 — no schedule pattern required
    const groupWorkouts = [
      makeGroupWorkout(daysAgoStr(0)), // today (Mon)
      makeGroupWorkout(daysAgoStr(1)), // yesterday (Sun)
      makeGroupWorkout(daysAgoStr(2)), // Sat
    ];
    expect(calculateStreaks(groupWorkouts)).toMatchObject({ burnStreak: 3, supernovaStreak: 3 });
  });

  it('streak increments when workouts overlap within 20 min but outside schedule', () => {
    // GroupWorkout documents are created by the 20-min overlap detection.
    // Streak calculator doesn't check schedules — it just counts days with GroupWorkouts.
    // These group workouts exist regardless of what the schedule says.
    const groupWorkouts = [
      makeGroupWorkout(daysAgoStr(0)),
      makeGroupWorkout(daysAgoStr(1)),
    ];
    expect(calculateStreaks(groupWorkouts)).toMatchObject({ burnStreak: 2, supernovaStreak: 2 });
  });

  it('burnStreak and supernovaStreak are equal for consecutive daily workouts', () => {
    const groupWorkouts = [
      makeGroupWorkout(daysAgoStr(0)),
      makeGroupWorkout(daysAgoStr(1)),
      makeGroupWorkout(daysAgoStr(2)),
      makeGroupWorkout(daysAgoStr(3)),
      makeGroupWorkout(daysAgoStr(4)),
    ];
    const result = calculateStreaks(groupWorkouts);
    expect(result.burnStreak).toBe(5);
    expect(result.supernovaStreak).toBe(5);
  });

  // --- US-002: 7-day inactivity window tests ---

  it('burnStreak survives a 6-day gap but supernovaStreak does not', () => {
    // Workouts on day 0 and day 7 (6-day gap between them: days 1-6 missing)
    const groupWorkouts = [
      makeGroupWorkout(daysAgoStr(0)),
      makeGroupWorkout(daysAgoStr(7)),
    ];
    expect(calculateStreaks(groupWorkouts)).toMatchObject({ burnStreak: 2, supernovaStreak: 1 });
  });

  it('streak resets on a 7-day gap', () => {
    // Workouts on day 0 and day 8 (7-day gap between them: days 1-7 missing)
    const groupWorkouts = [
      makeGroupWorkout(daysAgoStr(0)),
      makeGroupWorkout(daysAgoStr(8)),
    ];
    expect(calculateStreaks(groupWorkouts)).toMatchObject({ burnStreak: 1, supernovaStreak: 1 });
  });

  it('burnStreak survives multiple short gaps but supernovaStreak stops early', () => {
    // Workouts spread out with gaps of 3-5 days each — all < 7 for burn
    const groupWorkouts = [
      makeGroupWorkout(daysAgoStr(0)),   // today
      makeGroupWorkout(daysAgoStr(4)),   // 4-day gap (days 1-3 missing)
      makeGroupWorkout(daysAgoStr(10)),  // 6-day gap (days 5-9 missing, largest allowed)
      makeGroupWorkout(daysAgoStr(13)),  // 3-day gap (days 11-12 missing)
    ];
    expect(calculateStreaks(groupWorkouts)).toMatchObject({ burnStreak: 4, supernovaStreak: 1 });
  });

  it('streak resets to 0 when no workout in the last 7 days', () => {
    // Most recent workout was 7 days ago — leading gap of 7 days from today
    const groupWorkouts = [
      makeGroupWorkout(daysAgoStr(7)),
      makeGroupWorkout(daysAgoStr(8)),
    ];
    expect(calculateStreaks(groupWorkouts)).toMatchObject({ burnStreak: 0, supernovaStreak: 0 });
  });
});

describe('supernova vs burn streak differentiation', () => {
  const FIXED_NOW = new Date('2026-03-02T12:00:00.000Z').getTime();

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(FIXED_NOW);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('workout only today → burnStreak=1, supernovaStreak=1', () => {
    const groupWorkouts = [makeGroupWorkout(daysAgoStr(0))];
    expect(calculateStreaks(groupWorkouts)).toMatchObject({ burnStreak: 1, supernovaStreak: 1 });
  });

  it('workout only yesterday → burnStreak=1, supernovaStreak=1', () => {
    const groupWorkouts = [makeGroupWorkout(daysAgoStr(1))];
    expect(calculateStreaks(groupWorkouts)).toMatchObject({ burnStreak: 1, supernovaStreak: 1 });
  });

  it('last workout 2 days ago → burnStreak=1, supernovaStreak=0', () => {
    const groupWorkouts = [makeGroupWorkout(daysAgoStr(2))];
    expect(calculateStreaks(groupWorkouts)).toMatchObject({ burnStreak: 1, supernovaStreak: 0 });
  });

  it('last workout 6 days ago → burnStreak=1, supernovaStreak=0', () => {
    const groupWorkouts = [makeGroupWorkout(daysAgoStr(6))];
    expect(calculateStreaks(groupWorkouts)).toMatchObject({ burnStreak: 1, supernovaStreak: 0 });
  });

  it('last workout 7 days ago → burnStreak=0, supernovaStreak=0', () => {
    const groupWorkouts = [makeGroupWorkout(daysAgoStr(7))];
    expect(calculateStreaks(groupWorkouts)).toMatchObject({ burnStreak: 0, supernovaStreak: 0 });
  });

  it('workouts today and 3 days ago (2-day gap) → burnStreak=2, supernovaStreak=1', () => {
    const groupWorkouts = [
      makeGroupWorkout(daysAgoStr(0)),
      makeGroupWorkout(daysAgoStr(3)),
    ];
    expect(calculateStreaks(groupWorkouts)).toMatchObject({ burnStreak: 2, supernovaStreak: 1 });
  });

  it('workouts today and 2 days ago (1-day gap) → burnStreak=2, supernovaStreak=2', () => {
    const groupWorkouts = [
      makeGroupWorkout(daysAgoStr(0)),
      makeGroupWorkout(daysAgoStr(2)),
    ];
    expect(calculateStreaks(groupWorkouts)).toMatchObject({ burnStreak: 2, supernovaStreak: 2 });
  });

  it('no workouts → burnStreak=0, supernovaStreak=0', () => {
    expect(calculateStreaks([])).toMatchObject({ burnStreak: 0, supernovaStreak: 0 });
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
    expect(stats).toMatchObject({
      highestStreakEver: { value: 0, date: '' },
      firstGroupWorkoutDate: null,
      groupWorkoutsAllTime: 0,
      groupWorkoutsThisMonth: 0,
    });
    // last7Days still has 7 entries, all with hasWorkout: false
    expect(stats.last7Days).toHaveLength(7);
    expect(stats.last7Days.every((d) => !d.hasWorkout)).toBe(true);
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
    expect(stats.last7Days).toHaveLength(7);
  });
});

describe('calculateStreaks — last7Days', () => {
  // Fixed: 2026-03-02 Mon 12:00 UTC
  // last7Days indices:
  //   0: 2026-02-24 (T), 1: 2026-02-25 (W), 2: 2026-02-26 (T),
  //   3: 2026-02-27 (F), 4: 2026-02-28 (S), 5: 2026-03-01 (S), 6: 2026-03-02 (M)
  const FIXED_NOW = new Date('2026-03-02T12:00:00.000Z').getTime();

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(FIXED_NOW);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('returns 7 entries with all hasWorkout false when no workouts', () => {
    const { last7Days } = calculateStreaks([]);
    expect(last7Days).toHaveLength(7);
    expect(last7Days.every((d: StreakDayInfo) => !d.hasWorkout)).toBe(true);
    expect(last7Days.every((d: StreakDayInfo) => d.groupWorkoutId === null)).toBe(true);
  });

  it('returns correct day labels and dates for the 7-day window', () => {
    const { last7Days } = calculateStreaks([]);
    expect(last7Days[0]).toMatchObject({ date: '2026-02-24', dayLabel: 'T' });
    expect(last7Days[1]).toMatchObject({ date: '2026-02-25', dayLabel: 'W' });
    expect(last7Days[2]).toMatchObject({ date: '2026-02-26', dayLabel: 'T' });
    expect(last7Days[3]).toMatchObject({ date: '2026-02-27', dayLabel: 'F' });
    expect(last7Days[4]).toMatchObject({ date: '2026-02-28', dayLabel: 'S' });
    expect(last7Days[5]).toMatchObject({ date: '2026-03-01', dayLabel: 'S' });
    expect(last7Days[6]).toMatchObject({ date: '2026-03-02', dayLabel: 'M' });
  });

  it('marks all 7 days active when workouts exist on every day', () => {
    const groupWorkouts = Array.from({ length: 7 }, (_, i) =>
      makeGroupWorkout(daysAgoStr(6 - i)),
    );
    const { last7Days } = calculateStreaks(groupWorkouts);
    expect(last7Days).toHaveLength(7);
    expect(last7Days.every((d: StreakDayInfo) => d.hasWorkout)).toBe(true);
    expect(last7Days.every((d: StreakDayInfo) => d.groupWorkoutId !== null)).toBe(true);
  });

  it('marks none active when workouts are outside the 7-day window', () => {
    const groupWorkouts = [makeGroupWorkout(daysAgoStr(10))];
    const { last7Days } = calculateStreaks(groupWorkouts);
    expect(last7Days.every((d: StreakDayInfo) => !d.hasWorkout)).toBe(true);
  });

  it('handles alternating days correctly', () => {
    // Workouts on days 0, 2, 4, 6 (today, 2 days ago, 4 days ago, 6 days ago)
    const groupWorkouts = [
      makeGroupWorkout(daysAgoStr(0)),
      makeGroupWorkout(daysAgoStr(2)),
      makeGroupWorkout(daysAgoStr(4)),
      makeGroupWorkout(daysAgoStr(6)),
    ];
    const { last7Days } = calculateStreaks(groupWorkouts);
    // index 0 = 6 days ago (active), 1 = 5 days ago (inactive), ...
    expect(last7Days[0]!.hasWorkout).toBe(true);  // 6 days ago
    expect(last7Days[1]!.hasWorkout).toBe(false); // 5 days ago
    expect(last7Days[2]!.hasWorkout).toBe(true);  // 4 days ago
    expect(last7Days[3]!.hasWorkout).toBe(false); // 3 days ago
    expect(last7Days[4]!.hasWorkout).toBe(true);  // 2 days ago
    expect(last7Days[5]!.hasWorkout).toBe(false); // 1 day ago
    expect(last7Days[6]!.hasWorkout).toBe(true);  // today
  });

  it('streak with gaps shows correct last7Days', () => {
    // Only today has a workout — burnStreak > 0 but last7Days mostly empty
    const groupWorkouts = [makeGroupWorkout(daysAgoStr(0))];
    const { last7Days } = calculateStreaks(groupWorkouts);
    expect(last7Days[6]!.hasWorkout).toBe(true);
    expect(last7Days[6]!.groupWorkoutId).toBe(`gw-${daysAgoStr(0)}`);
    expect(last7Days.slice(0, 6).every((d: StreakDayInfo) => !d.hasWorkout)).toBe(true);
  });

  it('picks first groupWorkoutId when multiple workouts on same day', () => {
    const groupWorkouts = [
      makeGroupWorkout(daysAgoStr(0), { id: 'first-gw' }),
      makeGroupWorkout(daysAgoStr(0), { id: 'second-gw' }),
    ];
    const { last7Days } = calculateStreaks(groupWorkouts);
    expect(last7Days[6]!.hasWorkout).toBe(true);
    expect(last7Days[6]!.groupWorkoutId).toBe('first-gw');
  });
});
