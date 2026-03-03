import { randomUUID } from 'crypto';
import type { BurnBuddy, BurnSquad, GroupWorkout, Workout } from '@burnbuddy/shared';
import { getDb } from '../lib/firestore';

const GROUP_WORKOUT_WINDOW_MS = 20 * 60 * 1000; // 20 minutes

/**
 * After a user starts a workout, detects whether any Burn Buddy or Burn Squad
 * group workout conditions are met. Creates GroupWorkout documents for each
 * qualifying group.
 *
 * Burn Buddy: both buddies have active workouts started within the last 20 min.
 * Burn Squad: ALL members have active workouts started within the last 20 min.
 *
 * Deduplication: if a GroupWorkout for the same reference already exists within
 * the 20-minute window, no duplicate is created.
 *
 * Returns the list of GroupWorkout documents created.
 */
export async function detectGroupWorkouts(uid: string, workout: Workout): Promise<GroupWorkout[]> {
  const db = getDb();
  const cutoff = new Date(Date.now() - GROUP_WORKOUT_WINDOW_MS).toISOString();
  const created: GroupWorkout[] = [];

  // ── Burn Buddy detection ────────────────────────────────────────────────────

  const [buddySnap1, buddySnap2] = await Promise.all([
    db.collection('burnBuddies').where('uid1', '==', uid).get(),
    db.collection('burnBuddies').where('uid2', '==', uid).get(),
  ]);

  const burnBuddies = [
    ...buddySnap1.docs.map((d) => d.data() as BurnBuddy),
    ...buddySnap2.docs.map((d) => d.data() as BurnBuddy),
  ];

  for (const buddy of burnBuddies) {
    const partnerUid = buddy.uid1 === uid ? buddy.uid2 : buddy.uid1;

    // Check if partner has an active workout started within the 20-min window
    const partnerWorkoutSnap = await db
      .collection('workouts')
      .where('uid', '==', partnerUid)
      .where('status', '==', 'active')
      .where('startedAt', '>=', cutoff)
      .get();

    if (partnerWorkoutSnap.empty) continue;

    const partnerWorkout = partnerWorkoutSnap.docs[0].data() as Workout;

    // Dedup: skip if a GroupWorkout for this buddy pair was already created in the window
    const existingSnap = await db
      .collection('groupWorkouts')
      .where('type', '==', 'buddy')
      .where('referenceId', '==', buddy.id)
      .where('startedAt', '>=', cutoff)
      .get();

    if (!existingSnap.empty) continue;

    const id = randomUUID();
    const groupWorkout: GroupWorkout = {
      id,
      type: 'buddy',
      referenceId: buddy.id,
      memberUids: [uid, partnerUid].sort(),
      startedAt: new Date().toISOString(),
      workoutIds: [workout.id, partnerWorkout.id],
    };

    await db.collection('groupWorkouts').doc(id).set(groupWorkout);
    created.push(groupWorkout);
  }

  // ── Burn Squad detection ────────────────────────────────────────────────────

  const squadsSnap = await db
    .collection('burnSquads')
    .where('memberUids', 'array-contains', uid)
    .get();

  const squads = squadsSnap.docs.map((d) => d.data() as BurnSquad);

  for (const squad of squads) {
    const otherMemberUids = squad.memberUids.filter((m) => m !== uid);

    if (otherMemberUids.length === 0) continue;

    // Check if ALL other members have active workouts within the window
    const memberWorkouts: Workout[] = [workout];
    let allActive = true;

    for (const memberUid of otherMemberUids) {
      const memberWorkoutSnap = await db
        .collection('workouts')
        .where('uid', '==', memberUid)
        .where('status', '==', 'active')
        .where('startedAt', '>=', cutoff)
        .get();

      if (memberWorkoutSnap.empty) {
        allActive = false;
        break;
      }

      memberWorkouts.push(memberWorkoutSnap.docs[0].data() as Workout);
    }

    if (!allActive) continue;

    // Dedup: skip if a GroupWorkout for this squad was already created in the window
    const existingSnap = await db
      .collection('groupWorkouts')
      .where('type', '==', 'squad')
      .where('referenceId', '==', squad.id)
      .where('startedAt', '>=', cutoff)
      .get();

    if (!existingSnap.empty) continue;

    const id = randomUUID();
    const groupWorkout: GroupWorkout = {
      id,
      type: 'squad',
      referenceId: squad.id,
      memberUids: squad.memberUids,
      startedAt: new Date().toISOString(),
      workoutIds: memberWorkouts.map((w) => w.id),
    };

    await db.collection('groupWorkouts').doc(id).set(groupWorkout);
    created.push(groupWorkout);
  }

  return created;
}
