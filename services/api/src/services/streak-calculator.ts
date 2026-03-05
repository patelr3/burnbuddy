import type { GroupWorkout } from '@burnbuddy/shared';

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
