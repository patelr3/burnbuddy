import { Router, type Request, type Response } from 'express';
import type { UserProfile } from '@burnbuddy/shared';
import { requireAuth } from '../middleware/auth';
import { getDb } from '../lib/firestore';

/**
 * GET /users/search?email=<email>
 * Returns basic info (uid, displayName, email) for a user matching the given email, or 404.
 */

const router = Router();

router.get('/search', requireAuth, async (req: Request, res: Response): Promise<void> => {
  const email = req.query['email'] as string | undefined;

  if (!email) {
    res.status(400).json({ error: 'email query parameter is required' });
    return;
  }

  const db = getDb();
  const snapshot = await db.collection('users').where('email', '==', email).limit(1).get();

  if (snapshot.empty) {
    res.status(404).json({ error: 'User not found' });
    return;
  }

  const user = snapshot.docs[0].data() as UserProfile;
  res.json({ uid: user.uid, displayName: user.displayName, email: user.email });
});

/**
 * POST /users
 * Creates a new user profile (called immediately after Firebase Auth signup).
 * Requires authentication. Returns 409 if a profile already exists.
 */
router.post('/', requireAuth, async (req: Request, res: Response): Promise<void> => {
  const uid = req.user!.uid;
  const { email, displayName, fcmToken } = req.body as Partial<UserProfile>;

  if (!email || !displayName) {
    res.status(400).json({ error: 'email and displayName are required' });
    return;
  }

  const db = getDb();
  const docRef = db.collection('users').doc(uid);
  const existing = await docRef.get();

  if (existing.exists) {
    res.status(409).json({ error: 'User profile already exists' });
    return;
  }

  const profile: UserProfile = {
    uid,
    email,
    displayName,
    createdAt: new Date().toISOString(),
    ...(fcmToken !== undefined ? { fcmToken } : {}),
  };

  await docRef.set(profile);
  res.status(201).json(profile);
});

/**
 * GET /users/me
 * Returns the authenticated user's Firestore profile, or 404 if not yet created.
 */
router.get('/me', requireAuth, async (req: Request, res: Response): Promise<void> => {
  const uid = req.user!.uid;
  const db = getDb();
  const doc = await db.collection('users').doc(uid).get();

  if (!doc.exists) {
    res.status(404).json({ error: 'User profile not found' });
    return;
  }

  res.json(doc.data() as UserProfile);
});

/**
 * PUT /users/me
 * Upserts the authenticated user's profile.
 * Updates provided fields if the profile exists; creates it if it does not.
 */
router.put('/me', requireAuth, async (req: Request, res: Response): Promise<void> => {
  const uid = req.user!.uid;
  const { email, displayName, fcmToken } = req.body as Partial<UserProfile>;

  const db = getDb();
  const docRef = db.collection('users').doc(uid);
  const existing = await docRef.get();

  if (existing.exists) {
    const { gettingStartedDismissed } = req.body as Partial<UserProfile>;
    const updates: Partial<UserProfile> = {};
    if (email !== undefined) updates.email = email;
    if (displayName !== undefined) updates.displayName = displayName;
    if (fcmToken !== undefined) updates.fcmToken = fcmToken;
    if (gettingStartedDismissed !== undefined) updates.gettingStartedDismissed = gettingStartedDismissed;

    await docRef.update(updates);
    const updated = await docRef.get();
    res.json(updated.data() as UserProfile);
  } else {
    if (!email || !displayName) {
      res.status(400).json({ error: 'email and displayName are required to create a profile' });
      return;
    }

    const profile: UserProfile = {
      uid,
      email,
      displayName,
      createdAt: new Date().toISOString(),
      ...(fcmToken !== undefined ? { fcmToken } : {}),
    };

    await docRef.set(profile);
    res.status(201).json(profile);
  }
});

export default router;
