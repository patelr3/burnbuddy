import type { GroupWorkout, GroupStats } from '@burnbuddy/shared';

/**
 * Calculates streak for a buddy/squad using GroupWorkout documents as the
 * source of truth.
 *
 * A streak day is any UTC calendar day that has at least one GroupWorkout.
 * GroupWorkouts already enforce the "all members working out within a 20-min
 * window" constraint, so no per-member checks are needed here.
 *
 * Both burnStreak and supernovaStreak return the same value — the distinction
 * is no longer meaningful when using group workouts as the data source.
 *
 * The streak walks backwards from today. It tolerates gaps of up to 6
 * consecutive days without a group workout. A gap of 7 or more consecutive
 * days resets the streak to 0.
 */
export function calculateStreaks(
  groupWorkouts: GroupWorkout[],
): { burnStreak: number; supernovaStreak: number } {
  if (groupWorkouts.length === 0) {
    return { burnStreak: 0, supernovaStreak: 0 };
  }

  // Collect unique UTC dates that have a GroupWorkout
  const datesWithGroupWorkout = new Set<string>();
  for (const gw of groupWorkouts) {
    datesWithGroupWorkout.add(gw.startedAt.substring(0, 10));
  }

  let streak = 0;
  let gapDays = 0;
  const todayMs = Date.now();
  const MS_PER_DAY = 86_400_000;

  // Walk backwards from today up to 10 years to bound the loop.
  // Gaps of up to 6 days are tolerated; 7+ consecutive gap days reset.
  for (let i = 0; i < 3_650; i++) {
    const dateStr = new Date(todayMs - i * MS_PER_DAY).toISOString().substring(0, 10);

    if (datesWithGroupWorkout.has(dateStr)) {
      streak++;
      gapDays = 0;
    } else {
      gapDays++;
      if (gapDays >= 7) {
        break;
      }
    }
  }

  return { burnStreak: streak, supernovaStreak: streak };
}

/**
 * Calculates the highest streak ever achieved by walking the full group
 * workout history from earliest to latest. Uses the same 7-day gap tolerance.
 *
 * Returns the peak streak value and the date on which it was achieved
 * (the last workout day of the peak streak).
 */
export function calculateHighestStreakEver(
  groupWorkouts: GroupWorkout[],
): { value: number; date: string } {
  if (groupWorkouts.length === 0) {
    return { value: 0, date: '' };
  }

  // Sort unique workout dates ascending
  const dateSet = new Set<string>();
  for (const gw of groupWorkouts) {
    dateSet.add(gw.startedAt.substring(0, 10));
  }
  const sortedDates = [...dateSet].sort();

  let currentStreak = 1;
  let bestStreak = 1;
  let bestDate = sortedDates[0]!;

  for (let i = 1; i < sortedDates.length; i++) {
    const prev = new Date(sortedDates[i - 1]!).getTime();
    const curr = new Date(sortedDates[i]!).getTime();
    const gapDays = Math.round((curr - prev) / 86_400_000) - 1;

    if (gapDays < 7) {
      // Gap is tolerated — streak continues
      currentStreak++;
    } else {
      // Gap of 7+ days — reset streak
      currentStreak = 1;
    }

    if (currentStreak > bestStreak) {
      bestStreak = currentStreak;
      bestDate = sortedDates[i]!;
    }
  }

  return { value: bestStreak, date: bestDate };
}

/**
 * Calculates group stats (for the stats API endpoints) from a set of
 * GroupWorkout documents.
 */
export function calculateGroupStats(groupWorkouts: GroupWorkout[]): GroupStats {
  const highestStreakEver = calculateHighestStreakEver(groupWorkouts);

  const sorted = [...groupWorkouts].sort(
    (a, b) => new Date(a.startedAt).getTime() - new Date(b.startedAt).getTime(),
  );

  const firstGroupWorkoutDate = sorted.length > 0 ? sorted[0]!.startedAt : null;

  const now = new Date();
  const currentMonth = now.getUTCMonth();
  const currentYear = now.getUTCFullYear();
  const groupWorkoutsThisMonth = groupWorkouts.filter((gw) => {
    const d = new Date(gw.startedAt);
    return d.getUTCMonth() === currentMonth && d.getUTCFullYear() === currentYear;
  }).length;

  return {
    highestStreakEver,
    firstGroupWorkoutDate,
    groupWorkoutsAllTime: groupWorkouts.length,
    groupWorkoutsThisMonth,
  };
}
