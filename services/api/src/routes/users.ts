import { Router, type Request, type Response } from 'express';
import type { UserProfile } from '@burnbuddy/shared';
import { requireAuth } from '../middleware/auth';
import { getDb } from '../lib/firestore';
import { generateUniqueUsername, validateUsername } from '../lib/username';

/**
 * GET /users/search?q=<query>   — typeahead prefix search (returns array)
 * GET /users/search?email=<email> — exact email lookup (returns single object, legacy)
 */

const router = Router();

router.get('/search', requireAuth, async (req: Request, res: Response): Promise<void> => {
  const q = req.query['q'] as string | undefined;
  const email = req.query['email'] as string | undefined;

  // Legacy exact-email search
  if (email) {
    const db = getDb();
    const snapshot = await db.collection('users').where('email', '==', email).limit(1).get();

    if (snapshot.empty) {
      res.status(404).json({ error: 'User not found' });
      return;
    }

    const user = snapshot.docs[0].data() as UserProfile;
    res.json({ uid: user.uid, displayName: user.displayName, email: user.email });
    return;
  }

  // Typeahead prefix search
  if (!q || q.trim().length < 2) {
    res.status(400).json({ error: 'q parameter must be at least 2 characters' });
    return;
  }

  const query = q.trim();
  const currentUid = req.user!.uid;
  const db = getDb();

  // Prefix search on email using Firestore range query
  const snapshot = await db
    .collection('users')
    .where('email', '>=', query)
    .where('email', '<', query + '\uf8ff')
    .limit(10)
    .get();

  const results = snapshot.docs
    .map((doc: FirebaseFirestore.QueryDocumentSnapshot) => {
      const u = doc.data() as UserProfile;
      return { uid: u.uid, displayName: u.displayName, email: u.email };
    })
    .filter((u: { uid: string }) => u.uid !== currentUid);

  res.json(results);
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

  const { username, usernameLower } = await generateUniqueUsername(email, db);

  const profile: UserProfile = {
    uid,
    email,
    displayName,
    username,
    usernameLower,
    createdAt: new Date().toISOString(),
    ...(fcmToken !== undefined ? { fcmToken } : {}),
  };

  const batch = db.batch();
  batch.set(docRef, profile);
  batch.set(db.collection('usernames').doc(usernameLower), { uid });
  await batch.commit();

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
    const { gettingStartedDismissed, username: requestedUsername } = req.body as Partial<UserProfile>;
    const updates: Partial<UserProfile> = {};
    if (email !== undefined) updates.email = email;
    if (displayName !== undefined) updates.displayName = displayName;
    if (fcmToken !== undefined) updates.fcmToken = fcmToken;
    if (gettingStartedDismissed !== undefined) updates.gettingStartedDismissed = gettingStartedDismissed;

    const existingData = existing.data() as UserProfile;

    // Username update: validate format and uniqueness
    if (requestedUsername !== undefined) {
      const validationError = validateUsername(requestedUsername);
      if (validationError) {
        res.status(400).json({ error: validationError });
        return;
      }

      const newLower = requestedUsername.toLowerCase();
      const oldLower = existingData.usernameLower;

      if (newLower !== oldLower) {
        const existingReservation = await db.collection('usernames').doc(newLower).get();
        if (existingReservation.exists) {
          res.status(409).json({ error: 'Username already taken' });
          return;
        }

        updates.username = requestedUsername;
        updates.usernameLower = newLower;

        const batch = db.batch();
        batch.set(docRef, updates, { merge: true });
        batch.set(db.collection('usernames').doc(newLower), { uid });
        if (oldLower) {
          batch.delete(db.collection('usernames').doc(oldLower));
        }
        await batch.commit();
        const updated = await docRef.get();
        res.json(updated.data() as UserProfile);
        return;
      }
      // Same username (case-insensitive) — allow casing change
      if (requestedUsername !== existingData.username) {
        updates.username = requestedUsername;
      }
    }

    // Lazy migration: generate username for existing users that don't have one
    if (!existingData.username && !updates.username) {
      const migrationEmail = email ?? existingData.email;
      if (migrationEmail) {
        const { username, usernameLower } = await generateUniqueUsername(migrationEmail, db);
        updates.username = username;
        updates.usernameLower = usernameLower;

        const batch = db.batch();
        batch.set(docRef, updates, { merge: true });
        batch.set(db.collection('usernames').doc(usernameLower), { uid });
        await batch.commit();
        const updated = await docRef.get();
        res.json(updated.data() as UserProfile);
        return;
      }
    }

    await docRef.update(updates);
    const updated = await docRef.get();
    res.json(updated.data() as UserProfile);
  } else {
    if (!email || !displayName) {
      res.status(400).json({ error: 'email and displayName are required to create a profile' });
      return;
    }

    const { username, usernameLower } = await generateUniqueUsername(email, db);

    const profile: UserProfile = {
      uid,
      email,
      displayName,
      username,
      usernameLower,
      createdAt: new Date().toISOString(),
      ...(fcmToken !== undefined ? { fcmToken } : {}),
    };

    const batch = db.batch();
    batch.set(docRef, profile);
    batch.set(db.collection('usernames').doc(usernameLower), { uid });
    await batch.commit();
    res.status(201).json(profile);
  }
});

/**
 * GET /users/:uid
 * Returns public profile data (uid, displayName, email) for a user by uid.
 */
router.get('/:uid', requireAuth, async (req: Request, res: Response): Promise<void> => {
  const uid = req.params['uid'] as string;
  const db = getDb();
  const doc = await db.collection('users').doc(uid).get();

  if (!doc.exists) {
    res.status(404).json({ error: 'User not found' });
    return;
  }

  const profile = doc.data() as UserProfile;
  res.json({ uid: profile.uid, displayName: profile.displayName, email: profile.email });
});

export default router;
