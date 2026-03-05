import { randomUUID } from 'crypto';
import { Router, type Request, type Response } from 'express';
import type { UserProfile, Workout, WorkoutType } from '@burnbuddy/shared';
import { requireAuth } from '../middleware/auth';
import { getDb } from '../lib/firestore';
import { detectGroupWorkouts } from '../services/group-workout-detection';
import { sendWorkoutStartedNotifications } from '../services/push-notifications';
import { logger } from '../lib/logger';

const router = Router();

const AUTO_END_MS = 90 * 60 * 1000; // 1.5 hours in milliseconds

/**
 * POST /workouts
 * Starts a new workout for the authenticated user (status: active).
 */
router.post('/', requireAuth, async (req: Request, res: Response): Promise<void> => {
  const uid = req.user!.uid;
  const { type } = req.body as { type?: WorkoutType | string };

  if (!type) {
    res.status(400).json({ error: 'type is required' });
    return;
  }

  const db = getDb();
  const id = randomUUID();
  const workout: Workout = {
    id,
    uid,
    type,
    startedAt: new Date().toISOString(),
    status: 'active',
  };

  await db.collection('workouts').doc(id).set(workout);

  // Detect group workouts in background — errors must not fail workout creation
  detectGroupWorkouts(uid, workout).catch((err: unknown) => {
    logger.error({ err, uid, workoutId: id }, 'Group workout detection failed');
  });

  // Send push notifications to Burn Buddies and Burn Squad members in background
  const userDoc = await db.collection('users').doc(uid).get();
  const senderDisplayName = userDoc.exists
    ? ((userDoc.data() as UserProfile).displayName ?? 'Someone')
    : 'Someone';
  sendWorkoutStartedNotifications(uid, senderDisplayName).catch((err: unknown) => {
    logger.error({ err, uid }, 'Push notification send failed');
  });

  res.status(201).json(workout);
});

/**
 * PATCH /workouts/:id/end
 * Ends the active workout (sets endedAt, status: completed).
 */
router.patch('/:id/end', requireAuth, async (req: Request, res: Response): Promise<void> => {
  const uid = req.user!.uid;
  const id = req.params['id'] as string;
  const db = getDb();

  const workoutDoc = await db.collection('workouts').doc(id).get();

  if (!workoutDoc.exists) {
    res.status(404).json({ error: 'Workout not found' });
    return;
  }

  const workout = workoutDoc.data() as Workout;

  if (workout.uid !== uid) {
    res.status(403).json({ error: 'You can only end your own workouts' });
    return;
  }

  if (workout.status !== 'active') {
    res.status(409).json({ error: 'Workout is already completed' });
    return;
  }

  const endedAt = new Date().toISOString();
  await db.collection('workouts').doc(id).update({ status: 'completed', endedAt });
  res.json({ ...workout, status: 'completed', endedAt });
});

/**
 * GET /workouts
 * Returns the authenticated user's workout history.
 */
router.get('/', requireAuth, async (req: Request, res: Response): Promise<void> => {
  const uid = req.user!.uid;
  const db = getDb();

  const snap = await db.collection('workouts').where('uid', '==', uid).get();
  const workouts = snap.docs.map((doc) => doc.data() as Workout);
  res.json(workouts);
});

/**
 * Ends all workouts that have been active for more than 1.5 hours.
 * Intended to be called by a scheduled job or Cloud Function.
 * Returns the number of workouts auto-ended.
 */
export async function autoEndStaleWorkouts(): Promise<number> {
  const db = getDb();
  const cutoff = new Date(Date.now() - AUTO_END_MS).toISOString();

  const staleSnap = await db
    .collection('workouts')
    .where('status', '==', 'active')
    .where('startedAt', '<=', cutoff)
    .get();

  if (staleSnap.empty) return 0;

  const endedAt = new Date().toISOString();
  await Promise.all(
    staleSnap.docs.map((doc) =>
      db.collection('workouts').doc(doc.id).update({ status: 'completed', endedAt }),
    ),
  );

  return staleSnap.docs.length;
}

export default router;
