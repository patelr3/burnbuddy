import type { Workout } from '@burnbuddy/shared';

/**
 * Calculates Burn Streak and Supernova Streak for a group of members.
 *
 * - BurnStreak: consecutive calendar days (UTC) where ANY member completed a workout.
 * - SupernovaStreak: consecutive calendar days (UTC) where ALL members completed a workout.
 *
 * Both streaks walk backwards from today. A streak resets to 0 as soon as a day
 * with no qualifying activity is encountered.
 */
export function calculateStreaks(
  memberUids: string[],
  completedWorkouts: Workout[],
): { burnStreak: number; supernovaStreak: number } {
  if (memberUids.length === 0) {
    return { burnStreak: 0, supernovaStreak: 0 };
  }

  // Group workouts by UTC calendar date (YYYY-MM-DD) → set of uids that completed a workout
  const workoutsByDate = new Map<string, Set<string>>();

  for (const workout of completedWorkouts) {
    // Prefer endedAt over startedAt for the calendar day (completed workouts always have endedAt)
    const dateStr = (workout.endedAt ?? workout.startedAt).substring(0, 10);
    if (!workoutsByDate.has(dateStr)) {
      workoutsByDate.set(dateStr, new Set());
    }
    workoutsByDate.get(dateStr)!.add(workout.uid);
  }

  let burnStreak = 0;
  let supernovaStreak = 0;
  let burnStreakEnded = false;
  let supernovaStreakEnded = false;

  const todayMs = Date.now();
  const MS_PER_DAY = 86_400_000;

  // Walk backwards from today up to 10 years to bound the loop
  for (let i = 0; i < 3_650; i++) {
    if (burnStreakEnded && supernovaStreakEnded) break;

    const dateStr = new Date(todayMs - i * MS_PER_DAY).toISOString().substring(0, 10);
    const uidsOnDay = workoutsByDate.get(dateStr) ?? new Set<string>();

    if (!burnStreakEnded) {
      if (memberUids.some((uid) => uidsOnDay.has(uid))) {
        burnStreak++;
      } else {
        burnStreakEnded = true;
      }
    }

    if (!supernovaStreakEnded) {
      if (memberUids.every((uid) => uidsOnDay.has(uid))) {
        supernovaStreak++;
      } else {
        supernovaStreakEnded = true;
      }
    }
  }

  return { burnStreak, supernovaStreak };
}
