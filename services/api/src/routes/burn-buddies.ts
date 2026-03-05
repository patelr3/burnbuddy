import { randomUUID } from 'crypto';
import { Router, type Request, type Response } from 'express';
import type { BurnBuddy, BurnBuddyRequest, GroupWorkout, WorkoutSchedule } from '@burnbuddy/shared';
import { requireAuth } from '../middleware/auth';
import { getDb } from '../lib/firestore';
import { calculateStreaks, calculateGroupStats } from '../services/streak-calculator';

const router = Router();

/**
 * POST /burn-buddies/requests
 * Sends a Burn Buddy request to a friend (must already be friends).
 */
router.post('/requests', requireAuth, async (req: Request, res: Response): Promise<void> => {
  const fromUid = req.user!.uid;
  const { toUid } = req.body as { toUid?: string };

  if (!toUid) {
    res.status(400).json({ error: 'toUid is required' });
    return;
  }

  if (toUid === fromUid) {
    res.status(400).json({ error: 'Cannot send a Burn Buddy request to yourself' });
    return;
  }

  const db = getDb();

  // Verify they are already friends (sorted composite key)
  const [uid1, uid2] = [fromUid, toUid].sort();
  const friendDocId = `${uid1}_${uid2}`;
  const friendDoc = await db.collection('friends').doc(friendDocId).get();

  if (!friendDoc.exists) {
    res.status(400).json({ error: 'You must be friends before sending a Burn Buddy request' });
    return;
  }

  // Check if a pending request already exists
  const existing = await db
    .collection('burnBuddyRequests')
    .where('fromUid', '==', fromUid)
    .where('toUid', '==', toUid)
    .where('status', '==', 'pending')
    .limit(1)
    .get();

  if (!existing.empty) {
    res.status(409).json({ error: 'A pending Burn Buddy request already exists' });
    return;
  }

  const id = randomUUID();
  const burnBuddyRequest: BurnBuddyRequest = {
    id,
    fromUid,
    toUid,
    status: 'pending',
    createdAt: new Date().toISOString(),
  };

  await db.collection('burnBuddyRequests').doc(id).set(burnBuddyRequest);
  res.status(201).json(burnBuddyRequest);
});

/**
 * GET /burn-buddies/requests
 * Returns pending incoming and outgoing Burn Buddy requests for the authenticated user.
 */
router.get('/requests', requireAuth, async (req: Request, res: Response): Promise<void> => {
  const uid = req.user!.uid;
  const db = getDb();

  const [incomingSnap, outgoingSnap] = await Promise.all([
    db.collection('burnBuddyRequests').where('toUid', '==', uid).where('status', '==', 'pending').get(),
    db.collection('burnBuddyRequests').where('fromUid', '==', uid).where('status', '==', 'pending').get(),
  ]);

  res.json({
    incoming: incomingSnap.docs.map((doc) => doc.data() as BurnBuddyRequest),
    outgoing: outgoingSnap.docs.map((doc) => doc.data() as BurnBuddyRequest),
  });
});

/**
 * POST /burn-buddies/requests/:id/accept
 * Accepts a Burn Buddy request; creates the BurnBuddy document for both users.
 */
router.post(
  '/requests/:id/accept',
  requireAuth,
  async (req: Request, res: Response): Promise<void> => {
    const uid = req.user!.uid;
    const id = req.params['id'] as string;
    const db = getDb();

    const requestDoc = await db.collection('burnBuddyRequests').doc(id).get();

    if (!requestDoc.exists) {
      res.status(404).json({ error: 'Burn Buddy request not found' });
      return;
    }

    const burnBuddyRequest = requestDoc.data() as BurnBuddyRequest;

    if (burnBuddyRequest.toUid !== uid) {
      res.status(403).json({ error: 'You can only accept Burn Buddy requests sent to you' });
      return;
    }

    if (burnBuddyRequest.status !== 'pending') {
      res.status(409).json({ error: 'Burn Buddy request is no longer pending' });
      return;
    }

    await db.collection('burnBuddyRequests').doc(id).update({ status: 'accepted' });

    const burnBuddyId = randomUUID();
    const [bbUid1, bbUid2] = [burnBuddyRequest.fromUid, uid].sort();
    const burnBuddy: BurnBuddy = {
      id: burnBuddyId,
      uid1: bbUid1,
      uid2: bbUid2,
      createdAt: new Date().toISOString(),
    };

    await db.collection('burnBuddies').doc(burnBuddyId).set(burnBuddy);

    res.json({ success: true, burnBuddyRequestId: id, burnBuddy });
  },
);

/**
 * GET /burn-buddies
 * Returns all accepted Burn Buddies for the authenticated user.
 */
router.get('/', requireAuth, async (req: Request, res: Response): Promise<void> => {
  const uid = req.user!.uid;
  const db = getDb();

  const [snap1, snap2] = await Promise.all([
    db.collection('burnBuddies').where('uid1', '==', uid).get(),
    db.collection('burnBuddies').where('uid2', '==', uid).get(),
  ]);

  const burnBuddies = [
    ...snap1.docs.map((doc) => doc.data() as BurnBuddy),
    ...snap2.docs.map((doc) => doc.data() as BurnBuddy),
  ];

  res.json(burnBuddies);
});

/**
 * GET /burn-buddies/:id/streaks
 * Returns burnStreak and supernovaStreak for the given Burn Buddy.
 */
router.get('/:id/streaks', requireAuth, async (req: Request, res: Response): Promise<void> => {
  const uid = req.user!.uid;
  const id = req.params['id'] as string;
  const db = getDb();

  const burnBuddyDoc = await db.collection('burnBuddies').doc(id).get();

  if (!burnBuddyDoc.exists) {
    res.status(404).json({ error: 'Burn Buddy not found' });
    return;
  }

  const burnBuddy = burnBuddyDoc.data() as BurnBuddy;

  if (burnBuddy.uid1 !== uid && burnBuddy.uid2 !== uid) {
    res.status(403).json({ error: 'You are not a member of this Burn Buddy relationship' });
    return;
  }

  // Fetch all GroupWorkouts for this burn buddy relationship
  const groupWorkoutSnap = await db
    .collection('groupWorkouts')
    .where('referenceId', '==', id)
    .get();

  const groupWorkouts = groupWorkoutSnap.docs.map((doc) => doc.data() as GroupWorkout);
  const streaks = calculateStreaks(groupWorkouts);

  res.json(streaks);
});

/**
 * GET /burn-buddies/:id/stats
 * Returns group workout stats for the given Burn Buddy.
 */
router.get('/:id/stats', requireAuth, async (req: Request, res: Response): Promise<void> => {
  const uid = req.user!.uid;
  const id = req.params['id'] as string;
  const db = getDb();

  const burnBuddyDoc = await db.collection('burnBuddies').doc(id).get();

  if (!burnBuddyDoc.exists) {
    res.status(404).json({ error: 'Burn Buddy not found' });
    return;
  }

  const burnBuddy = burnBuddyDoc.data() as BurnBuddy;

  if (burnBuddy.uid1 !== uid && burnBuddy.uid2 !== uid) {
    res.status(403).json({ error: 'You are not a member of this Burn Buddy relationship' });
    return;
  }

  const groupWorkoutSnap = await db
    .collection('groupWorkouts')
    .where('referenceId', '==', id)
    .get();

  const groupWorkouts = groupWorkoutSnap.docs.map((doc) => doc.data() as GroupWorkout);
  const stats = calculateGroupStats(groupWorkouts);

  res.json(stats);
});

/**
 * GET /burn-buddies/:id
 * Returns a single Burn Buddy relationship (must be a member).
 */
router.get('/:id', requireAuth, async (req: Request, res: Response): Promise<void> => {
  const uid = req.user!.uid;
  const id = req.params['id'] as string;
  const db = getDb();

  const burnBuddyDoc = await db.collection('burnBuddies').doc(id).get();

  if (!burnBuddyDoc.exists) {
    res.status(404).json({ error: 'Burn Buddy not found' });
    return;
  }

  const burnBuddy = burnBuddyDoc.data() as BurnBuddy;

  if (burnBuddy.uid1 !== uid && burnBuddy.uid2 !== uid) {
    res.status(403).json({ error: 'You are not a member of this Burn Buddy relationship' });
    return;
  }

  res.json(burnBuddy);
});

/**
 * PUT /burn-buddies/:id
 * Updates the workout schedule for a Burn Buddy relationship (must be a member).
 */
router.put('/:id', requireAuth, async (req: Request, res: Response): Promise<void> => {
  const uid = req.user!.uid;
  const id = req.params['id'] as string;
  const db = getDb();

  const burnBuddyDoc = await db.collection('burnBuddies').doc(id).get();

  if (!burnBuddyDoc.exists) {
    res.status(404).json({ error: 'Burn Buddy not found' });
    return;
  }

  const burnBuddy = burnBuddyDoc.data() as BurnBuddy;

  if (burnBuddy.uid1 !== uid && burnBuddy.uid2 !== uid) {
    res.status(403).json({ error: 'You are not a member of this Burn Buddy relationship' });
    return;
  }

  const { workoutSchedule } = req.body as { workoutSchedule?: WorkoutSchedule };
  await db.collection('burnBuddies').doc(id).update({ workoutSchedule: workoutSchedule ?? null });

  res.json({ ...burnBuddy, workoutSchedule });
});

/**
 * DELETE /burn-buddies/:id
 * Removes a Burn Buddy relationship.
 */
router.delete('/:id', requireAuth, async (req: Request, res: Response): Promise<void> => {
  const uid = req.user!.uid;
  const id = req.params['id'] as string;
  const db = getDb();

  const burnBuddyDoc = await db.collection('burnBuddies').doc(id).get();

  if (!burnBuddyDoc.exists) {
    res.status(404).json({ error: 'Burn Buddy not found' });
    return;
  }

  const burnBuddy = burnBuddyDoc.data() as BurnBuddy;

  if (burnBuddy.uid1 !== uid && burnBuddy.uid2 !== uid) {
    res.status(403).json({ error: 'You are not a member of this Burn Buddy relationship' });
    return;
  }

  await db.collection('burnBuddies').doc(id).delete();
  res.status(204).send();
});

export default router;
