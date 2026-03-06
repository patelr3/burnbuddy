import { Router, type Request, type Response } from 'express';
import type { GroupWorkout } from '@burnbuddy/shared';
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

export default router;
