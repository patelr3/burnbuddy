import { Router, type Request, type Response } from 'express';
import type { GroupWorkout, Workout, UserProfile } from '@burnbuddy/shared';
import { requireAuth } from '../middleware/auth';
import { cacheControl } from '../middleware/cache-control';
import { getDb } from '../lib/firestore';

const router = Router();

/**
 * GET /group-workouts
 * Returns all group workouts where the authenticated user is a member.
 */
router.get('/', requireAuth, cacheControl(5), async (req: Request, res: Response): Promise<void> => {
  const uid = req.user!.uid;
  const db = getDb();

  const snap = await db.collection('groupWorkouts').where('memberUids', 'array-contains', uid).get();
  const groupWorkouts = snap.docs.map((doc) => doc.data() as GroupWorkout);

  res.json(groupWorkouts);
});

/**
 * GET /group-workouts/:id
 * Returns a single group workout with enriched participant workout details.
 */
router.get('/:id', requireAuth, async (req: Request, res: Response): Promise<void> => {
  const uid = req.user!.uid;
  const id = req.params['id'] as string;
  const db = getDb();

  const gwDoc = await db.collection('groupWorkouts').doc(id).get();

  if (!gwDoc.exists) {
    res.status(404).json({ error: 'Group workout not found' });
    return;
  }

  const groupWorkout = gwDoc.data() as GroupWorkout;

  if (!groupWorkout.memberUids.includes(uid)) {
    res.status(403).json({ error: 'You are not a member of this group workout' });
    return;
  }

  // Fetch individual workouts and user profiles in parallel
  const [workoutDocs, profileDocs] = await Promise.all([
    Promise.all(
      groupWorkout.workoutIds.map((wId) => db.collection('workouts').doc(wId).get()),
    ),
    Promise.all(
      groupWorkout.memberUids.map((memberUid) => db.collection('users').doc(memberUid).get()),
    ),
  ]);

  const workoutsById = new Map<string, Workout>();
  for (const doc of workoutDocs) {
    if (doc.exists) {
      const w = doc.data() as Workout;
      workoutsById.set(w.id, w);
    }
  }

  const profilesByUid = new Map<string, UserProfile>();
  for (const doc of profileDocs) {
    if (doc.exists) {
      const p = doc.data() as UserProfile;
      profilesByUid.set(p.uid, p);
    }
  }

  // Build enriched participants array from workouts, joining with profiles
  const participants = groupWorkout.workoutIds
    .map((wId) => workoutsById.get(wId))
    .filter((w): w is Workout => w !== undefined)
    .map((w) => {
      const profile = profilesByUid.get(w.uid);
      return {
        uid: w.uid,
        displayName: profile?.displayName ?? 'Unknown',
        workoutType: w.type,
        startedAt: w.startedAt,
        endedAt: w.endedAt ?? null,
        status: w.status,
      };
    });

  res.json({ ...groupWorkout, participants });
});

export default router;
