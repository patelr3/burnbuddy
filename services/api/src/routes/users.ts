import { Router, type Request, type Response, type NextFunction } from 'express';
import multer from 'multer';
import type {
  UserProfile,
  BurnBuddy,
  BurnSquad,
  GroupWorkout,
  Workout,
  ProfileStats,
} from '@burnbuddy/shared';
import { requireAuth } from '../middleware/auth';
import { admin } from '../lib/firebase';
import { getDb } from '../lib/firestore';
import { generateUniqueUsername, validateUsername } from '../lib/username';
import { animeFilter } from '../lib/anime-filter';
import { calculateStreaks, calculateHighestStreakEver } from '../services/streak-calculator';

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 }, // 5 MB
});

const ALLOWED_IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp'];

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
    res.json({ uid: user.uid, displayName: user.displayName, email: user.email, username: user.username, profilePictureUrl: user.profilePictureUrl });
    return;
  }

  // Typeahead prefix search
  if (!q || q.trim().length < 2) {
    res.status(400).json({ error: 'q parameter must be at least 2 characters' });
    return;
  }

  const query = q.trim();
  const queryLower = query.toLowerCase();
  const currentUid = req.user!.uid;
  const db = getDb();

  // Run email and username prefix searches in parallel
  const [emailSnapshot, usernameSnapshot] = await Promise.all([
    db.collection('users')
      .where('email', '>=', query)
      .where('email', '<', query + '\uf8ff')
      .limit(10)
      .get(),
    db.collection('users')
      .where('usernameLower', '>=', queryLower)
      .where('usernameLower', '<', queryLower + '\uf8ff')
      .limit(10)
      .get(),
  ]);

  // Merge and deduplicate by uid
  const seen = new Set<string>();
  const results: Array<{ uid: string; displayName: string; email: string; username?: string; profilePictureUrl?: string }> = [];

  for (const doc of [...emailSnapshot.docs, ...usernameSnapshot.docs]) {
    const u = doc.data() as UserProfile;
    if (u.uid === currentUid || seen.has(u.uid)) continue;
    seen.add(u.uid);
    results.push({ uid: u.uid, displayName: u.displayName, email: u.email, username: u.username, profilePictureUrl: u.profilePictureUrl });
    if (results.length >= 10) break;
  }

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
 * POST /users/me/profile-picture
 * Uploads a profile picture, converts it to anime style, stores it in Firebase Storage,
 * and updates the user's Firestore document with the download URL.
 */
router.post(
  '/me/profile-picture',
  requireAuth,
  (req: Request, res: Response, next: NextFunction) => {
    upload.single('picture')(req, res, (err: unknown) => {
      if (err && err instanceof multer.MulterError && err.code === 'LIMIT_FILE_SIZE') {
        res.status(413).json({ error: 'File too large. Maximum size is 5 MB.' });
        return;
      }
      if (err) { next(err); return; }
      next();
    });
  },
  async (req: Request, res: Response): Promise<void> => {
    if (!req.file) {
      res.status(400).json({ error: 'No file uploaded' });
      return;
    }

    if (!ALLOWED_IMAGE_TYPES.includes(req.file.mimetype)) {
      res.status(400).json({ error: 'Invalid file type. Only JPEG, PNG, and WebP are allowed.' });
      return;
    }

    const uid = req.user!.uid;
    const animeBuffer = await animeFilter(req.file.buffer);

    const bucket = admin.storage().bucket();
    const filePath = `profile-pictures/${uid}/avatar.webp`;
    const storageFile = bucket.file(filePath);

    await storageFile.save(animeBuffer, {
      contentType: 'image/webp',
      metadata: { cacheControl: 'public, max-age=86400' },
    });

    const [url] = await storageFile.getSignedUrl({
      action: 'read',
      expires: '2099-12-31',
    });

    const db = getDb();
    await db.collection('users').doc(uid).update({ profilePictureUrl: url });

    res.json({ profilePictureUrl: url });
  },
);

/**
 * DELETE /users/me/profile-picture
 * Removes the user's profile picture from Firebase Storage and clears the Firestore field.
 * Returns 204 on success (idempotent — succeeds even if no picture existed).
 */
router.delete('/me/profile-picture', requireAuth, async (req: Request, res: Response): Promise<void> => {
  const uid = req.user!.uid;
  const bucket = admin.storage().bucket();
  const filePath = `profile-pictures/${uid}/avatar.webp`;
  const storageFile = bucket.file(filePath);

  // Delete from Storage — ignore "not found" errors for idempotency
  try {
    await storageFile.delete();
  } catch (err: unknown) {
    const code = (err as { code?: number }).code;
    if (code !== 404) throw err;
  }

  // Clear the profilePictureUrl field in Firestore
  const db = getDb();
  await db.collection('users').doc(uid).update({
    profilePictureUrl: admin.firestore.FieldValue.delete(),
  });

  res.status(204).send();
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
 * GET /users/:uid/profile
 * Returns aggregated profile stats for a user. Requires the requester to be a friend.
 */
router.get('/:uid/profile', requireAuth, async (req: Request, res: Response): Promise<void> => {
  const requesterUid = req.user!.uid;
  const targetUid = req.params['uid'] as string;
  const db = getDb();

  // 1. Get target user profile
  const userDoc = await db.collection('users').doc(targetUid).get();
  if (!userDoc.exists) {
    res.status(404).json({ error: 'User not found' });
    return;
  }
  const profile = userDoc.data() as UserProfile;

  // 2. Check friendship (sorted composite key)
  const [friendUid1, friendUid2] = [requesterUid, targetUid].sort();
  const friendDocId = `${friendUid1}_${friendUid2}`;
  const friendDoc = await db.collection('friends').doc(friendDocId).get();
  if (!friendDoc.exists) {
    res.status(403).json({ error: 'You can only view profiles of your friends' });
    return;
  }

  // 3. Get target's burn buddies and squads in parallel
  const [bbSnap1, bbSnap2, squadSnap] = await Promise.all([
    db.collection('burnBuddies').where('uid1', '==', targetUid).get(),
    db.collection('burnBuddies').where('uid2', '==', targetUid).get(),
    db.collection('burnSquads').where('memberUids', 'array-contains', targetUid).get(),
  ]);

  const burnBuddies = [
    ...bbSnap1.docs.map((d) => d.data() as BurnBuddy),
    ...bbSnap2.docs.map((d) => d.data() as BurnBuddy),
  ];
  const burnSquads = squadSnap.docs.map((d) => d.data() as BurnSquad);

  // 4. Get partner display names for buddy relationships
  const partnerUids = burnBuddies.map((bb) => (bb.uid1 === targetUid ? bb.uid2 : bb.uid1));
  const partnerDocs = await Promise.all(
    partnerUids.map((uid) => db.collection('users').doc(uid).get()),
  );
  const partnerNames: Record<string, string> = {};
  partnerDocs.forEach((doc, i) => {
    if (doc.exists) {
      partnerNames[partnerUids[i]!] = (doc.data() as UserProfile).displayName;
    }
  });

  // 5. Get group workouts for all buddy/squad relationships
  const allReferenceIds = [
    ...burnBuddies.map((bb) => bb.id),
    ...burnSquads.map((sq) => sq.id),
  ];

  const groupWorkoutsByRef: Record<string, GroupWorkout[]> = {};
  await Promise.all(
    allReferenceIds.map(async (refId) => {
      const snap = await db.collection('groupWorkouts').where('referenceId', '==', refId).get();
      groupWorkoutsByRef[refId] = snap.docs.map((d) => d.data() as GroupWorkout);
    }),
  );

  // 6. Calculate highest active streak and highest streak ever across all relationships
  let highestActiveStreak: ProfileStats['highestActiveStreak'] = null;
  let highestStreakEver: ProfileStats['highestStreakEver'] = null;

  for (const bb of burnBuddies) {
    const gws = groupWorkoutsByRef[bb.id] ?? [];
    const partnerUid = bb.uid1 === targetUid ? bb.uid2 : bb.uid1;
    const name = partnerNames[partnerUid] ?? 'Unknown';

    const { burnStreak } = calculateStreaks(gws);
    if (burnStreak > 0 && (!highestActiveStreak || burnStreak > highestActiveStreak.value)) {
      highestActiveStreak = { value: burnStreak, name };
    }

    const hse = calculateHighestStreakEver(gws);
    if (hse.value > 0 && (!highestStreakEver || hse.value > highestStreakEver.value)) {
      highestStreakEver = { value: hse.value, date: hse.date, name };
    }
  }

  for (const sq of burnSquads) {
    const gws = groupWorkoutsByRef[sq.id] ?? [];
    const name = sq.name;

    const { burnStreak } = calculateStreaks(gws);
    if (burnStreak > 0 && (!highestActiveStreak || burnStreak > highestActiveStreak.value)) {
      highestActiveStreak = { value: burnStreak, name };
    }

    const hse = calculateHighestStreakEver(gws);
    if (hse.value > 0 && (!highestStreakEver || hse.value > highestStreakEver.value)) {
      highestStreakEver = { value: hse.value, date: hse.date, name };
    }
  }

  // 7. Get individual workouts for counts
  const workoutSnap = await db.collection('workouts').where('uid', '==', targetUid).get();
  const workouts = workoutSnap.docs.map((d) => d.data() as Workout);

  const sortedWorkouts = [...workouts].sort(
    (a, b) => new Date(a.startedAt).getTime() - new Date(b.startedAt).getTime(),
  );
  const firstWorkoutDate = sortedWorkouts.length > 0 ? sortedWorkouts[0]!.startedAt : null;

  const now = new Date();
  const currentMonth = now.getUTCMonth();
  const currentYear = now.getUTCFullYear();
  const workoutsThisMonth = workouts.filter((w) => {
    const d = new Date(w.startedAt);
    return d.getUTCMonth() === currentMonth && d.getUTCFullYear() === currentYear;
  }).length;

  // 8. Determine burn buddy relationship status between requester and target
  let buddyRelationshipStatus: ProfileStats['buddyRelationshipStatus'] = 'none';

  const isBuddy = burnBuddies.some(
    (bb) =>
      (bb.uid1 === requesterUid && bb.uid2 === targetUid) ||
      (bb.uid1 === targetUid && bb.uid2 === requesterUid),
  );

  if (isBuddy) {
    buddyRelationshipStatus = 'buddies';
  } else {
    const [sentSnap, receivedSnap] = await Promise.all([
      db
        .collection('burnBuddyRequests')
        .where('fromUid', '==', requesterUid)
        .where('toUid', '==', targetUid)
        .where('status', '==', 'pending')
        .limit(1)
        .get(),
      db
        .collection('burnBuddyRequests')
        .where('fromUid', '==', targetUid)
        .where('toUid', '==', requesterUid)
        .where('status', '==', 'pending')
        .limit(1)
        .get(),
    ]);

    if (!sentSnap.empty) {
      buddyRelationshipStatus = 'pending_sent';
    } else if (!receivedSnap.empty) {
      buddyRelationshipStatus = 'pending_received';
    }
  }

  // 9. Return ProfileStats
  const profileStats: ProfileStats = {
    displayName: profile.displayName,
    username: profile.username,
    profilePictureUrl: profile.profilePictureUrl,
    highestActiveStreak,
    highestStreakEver,
    firstWorkoutDate,
    workoutsAllTime: workouts.length,
    workoutsThisMonth,
    buddyRelationshipStatus,
  };

  res.json(profileStats);
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
  res.json({ uid: profile.uid, displayName: profile.displayName, email: profile.email, profilePictureUrl: profile.profilePictureUrl });
});

export default router;
