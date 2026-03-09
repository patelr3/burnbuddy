import type { GroupWorkout, GroupStats, StreakDayInfo } from '@burnbuddy/shared';

const DAY_LABELS = ['S', 'M', 'T', 'W', 'T', 'F', 'S'] as const;
const MS_PER_DAY = 86_400_000;

/**
 * Builds a last7Days array: index 0 = 6 days ago, index 6 = today.
 * Each entry has: date (YYYY-MM-DD), hasWorkout, groupWorkoutId, dayLabel.
 */
function buildLast7Days(groupWorkouts: GroupWorkout[]): StreakDayInfo[] {
  // Map each UTC date to the first GroupWorkout ID on that day
  const dateToWorkoutId = new Map<string, string>();
  for (const gw of groupWorkouts) {
    const dateStr = gw.startedAt.substring(0, 10);
    if (!dateToWorkoutId.has(dateStr)) {
      dateToWorkoutId.set(dateStr, gw.id);
    }
  }

  const todayMs = Date.now();
  const result: StreakDayInfo[] = [];

  for (let i = 6; i >= 0; i--) {
    const d = new Date(todayMs - i * MS_PER_DAY);
    const dateStr = d.toISOString().substring(0, 10);
    const dayOfWeek = d.getUTCDay(); // 0=Sun..6=Sat
    const workoutId = dateToWorkoutId.get(dateStr) ?? null;
    result.push({
      date: dateStr,
      hasWorkout: workoutId !== null,
      groupWorkoutId: workoutId,
      dayLabel: DAY_LABELS[dayOfWeek]!,
    });
  }

  return result;
}

/**
 * Walks backwards from today counting unique workout days. A gap of more than
 * `maxGap` consecutive non-workout days ends the streak.
 */
function countStreak(datesWithGroupWorkout: Set<string>, maxGap: number): number {
  let streak = 0;
  let gapDays = 0;
  const todayMs = Date.now();

  for (let i = 0; i < 3_650; i++) {
    const dateStr = new Date(todayMs - i * MS_PER_DAY).toISOString().substring(0, 10);

    if (datesWithGroupWorkout.has(dateStr)) {
      streak++;
      gapDays = 0;
    } else {
      gapDays++;
      if (gapDays > maxGap) {
        break;
      }
    }
  }

  return streak;
}

/**
 * Calculates streak for a buddy/squad using GroupWorkout documents as the
 * source of truth.
 *
 * A streak day is any UTC calendar day that has at least one GroupWorkout.
 * GroupWorkouts already enforce the "all members working out within a 20-min
 * window" constraint, so no per-member checks are needed here.
 *
 * burnStreak tolerates gaps of up to 6 consecutive days (resets at 7+).
 * supernovaStreak tolerates gaps of up to 1 day (resets at 2+), requiring
 * near-daily activity.
 */
export function calculateStreaks(
  groupWorkouts: GroupWorkout[],
): { burnStreak: number; supernovaStreak: number; last7Days: StreakDayInfo[] } {
  const last7Days = buildLast7Days(groupWorkouts);

  if (groupWorkouts.length === 0) {
    return { burnStreak: 0, supernovaStreak: 0, last7Days };
  }

  const datesWithGroupWorkout = new Set<string>();
  for (const gw of groupWorkouts) {
    datesWithGroupWorkout.add(gw.startedAt.substring(0, 10));
  }

  const burnStreak = countStreak(datesWithGroupWorkout, 6);
  const supernovaStreak = countStreak(datesWithGroupWorkout, 1);

  return { burnStreak, supernovaStreak, last7Days };
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
    last7Days: buildLast7Days(groupWorkouts),
  };
}
