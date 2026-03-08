import type { Request, Response, NextFunction } from 'express';
import type { UserProfile } from '@burnbuddy/shared';
import { getDb } from '../lib/firestore';

/**
 * Express middleware that verifies the authenticated user has a Firestore profile.
 * Must be applied after `requireAuth` (requires `req.user` to be set).
 *
 * On success: attaches the profile to `req.profile` and calls `next()`.
 * On failure: responds with 403 { error: 'Profile required' }.
 */
export async function requireProfile(req: Request, res: Response, next: NextFunction): Promise<void> {
  const uid = req.user!.uid;
  const db = getDb();

  const profileDoc = await db.collection('users').doc(uid).get();

  if (!profileDoc.exists) {
    res.status(403).json({ error: 'Profile required' });
    return;
  }

  req.profile = profileDoc.data() as UserProfile;
  next();
}
