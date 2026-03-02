import type { BurnBuddy, BurnSquad, UserProfile } from '@burnbuddy/shared';
import { admin } from '../lib/firebase';
import { getDb } from '../lib/firestore';

/**
 * Sends push notifications to all Burn Buddies and Burn Squad members of a user
 * when that user starts a workout.
 *
 * Users with no fcmToken are skipped silently.
 * Errors are caught and do not propagate — call this fire-and-forget.
 */
export async function sendWorkoutStartedNotifications(
  uid: string,
  senderDisplayName: string,
): Promise<void> {
  const db = getDb();

  // ── Collect recipient UIDs ──────────────────────────────────────────────────

  const recipientUids = new Set<string>();

  // Burn Buddies: two parallel queries (uid1 or uid2)
  const [buddySnap1, buddySnap2, squadsSnap] = await Promise.all([
    db.collection('burnBuddies').where('uid1', '==', uid).get(),
    db.collection('burnBuddies').where('uid2', '==', uid).get(),
    db.collection('burnSquads').where('memberUids', 'array-contains', uid).get(),
  ]);

  for (const doc of [...buddySnap1.docs, ...buddySnap2.docs]) {
    const buddy = doc.data() as BurnBuddy;
    const partnerUid = buddy.uid1 === uid ? buddy.uid2 : buddy.uid1;
    recipientUids.add(partnerUid);
  }

  for (const doc of squadsSnap.docs) {
    const squad = doc.data() as BurnSquad;
    for (const memberUid of squad.memberUids) {
      if (memberUid !== uid) {
        recipientUids.add(memberUid);
      }
    }
  }

  if (recipientUids.size === 0) return;

  // ── Fetch FCM tokens for all recipients ─────────────────────────────────────

  const profileSnaps = await Promise.all(
    [...recipientUids].map((recipientUid) =>
      db.collection('users').doc(recipientUid).get(),
    ),
  );

  const tokens: string[] = [];
  for (const snap of profileSnaps) {
    if (!snap.exists) continue;
    const profile = snap.data() as UserProfile;
    if (profile.fcmToken) {
      tokens.push(profile.fcmToken);
    }
  }

  if (tokens.length === 0) return;

  // ── Send FCM multicast message ──────────────────────────────────────────────

  await admin.messaging().sendEachForMulticast({
    tokens,
    notification: {
      title: `${senderDisplayName} started a workout!`,
      body: 'Jump in within 20 min to log a group workout',
    },
    data: {
      type: 'WORKOUT_STARTED',
      uid,
    },
  });
}
