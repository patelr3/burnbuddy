import { randomUUID } from 'crypto';
import { GROUP_WORKOUT_WINDOW_MS } from '@burnbuddy/shared';
import type { BurnBuddy, BurnSquad, GroupWorkout, Workout } from '@burnbuddy/shared';
import { getDb } from '../lib/firestore';

/**
 * Finds active workouts for a user that started within the detection window.
 * Uses a simple single-field query (uid) and filters status/startedAt in memory
 * to avoid requiring Firestore composite indexes.
 */
async function findActiveWorkoutsInWindow(
  uid: string,
  cutoff: string,
): Promise<Workout[]> {
  const db = getDb();
  const snap = await db.collection('workouts').where('uid', '==', uid).get();
  return snap.docs
    .map((d) => d.data() as Workout)
    .filter((w) => w.status === 'active' && w.startedAt >= cutoff);
}

/**
 * Checks if a GroupWorkout already exists for the given type and reference
 * within the detection window. Uses a simple single-field query (referenceId)
 * and filters type/startedAt in memory.
 */
async function hasExistingGroupWorkout(
  type: 'buddy' | 'squad',
  referenceId: string,
  cutoff: string,
): Promise<boolean> {
  const db = getDb();
  const snap = await db
    .collection('groupWorkouts')
    .where('referenceId', '==', referenceId)
    .get();
  return snap.docs.some((d) => {
    const gw = d.data() as GroupWorkout;
    return gw.type === type && gw.startedAt >= cutoff;
  });
}

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

    const partnerWorkouts = await findActiveWorkoutsInWindow(partnerUid, cutoff);
    if (partnerWorkouts.length === 0) continue;

    const partnerWorkout = partnerWorkouts[0];

    if (await hasExistingGroupWorkout('buddy', buddy.id, cutoff)) continue;

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

    const memberWorkouts: Workout[] = [workout];
    let allActive = true;

    for (const memberUid of otherMemberUids) {
      const memberActiveWorkouts = await findActiveWorkoutsInWindow(memberUid, cutoff);

      if (memberActiveWorkouts.length === 0) {
        allActive = false;
        break;
      }

      memberWorkouts.push(memberActiveWorkouts[0]);
    }

    if (!allActive) continue;

    if (await hasExistingGroupWorkout('squad', squad.id, cutoff)) continue;

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
