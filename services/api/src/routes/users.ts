import { Router, type Request, type Response, type NextFunction } from 'express';
import multer from 'multer';
import type {
  UserProfile,
  BurnBuddy,
  BurnSquad,
  GroupWorkout,
  Workout,
  ProfileStats,
  WorkoutGoal,
} from '@burnbuddy/shared';
import { requireAuth } from '../middleware/auth';
import { admin } from '../lib/firebase';
import { cacheControl } from '../middleware/cache-control';
import { getDb } from '../lib/firestore';
import { FieldValue } from 'firebase-admin/firestore';
import { getContainerClient, getBlobUrl } from '../lib/storage';
import { generateUniqueUsername, validateUsername } from '../lib/username';
import sharp from 'sharp';
import { calculateStreaks, calculateHighestStreakEver } from '../services/streak-calculator';
import { logger } from '../lib/logger';
import { ReplicateCartoonService, PassthroughCartoonService } from '../services/replicate-cartoon-service';

// Creates a new cartoon service instance per request for clean testability.
// Falls back to PassthroughCartoonService when no Replicate token is configured.
function createCartoonService() {
  if (!process.env.REPLICATE_API_TOKEN) {
    logger.warn('REPLICATE_API_TOKEN not set — cartoon conversion disabled, using original image as avatar');
    return new PassthroughCartoonService();
  }
  return new ReplicateCartoonService();
}

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 }, // 5 MB
});

const ALLOWED_IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif'];

const EXTENSION_TO_MIME: Record<string, string> = {
  '.heic': 'image/heic',
  '.heif': 'image/heif',
};

const VALID_WORKOUT_GOALS: WorkoutGoal[] = ['lose_weight', 'build_muscle', 'stay_active', 'improve_endurance', 'reduce_stress'];

/** Private health fields that must not appear in public-facing responses. */
const HEALTH_FIELDS = ['heightCm', 'weightKg', 'dateOfBirth', 'workoutGoal', 'unitPreference', 'healthProfilePromptDismissed'] as const;

type HealthField = (typeof HEALTH_FIELDS)[number];

/** Strip private health fields from user data for public-facing responses. */
function stripHealthFields(data: UserProfile): Omit<UserProfile, HealthField> {
  const { heightCm, weightKg, dateOfBirth, workoutGoal, unitPreference, healthProfilePromptDismissed, ...rest } = data;
  return rest;
}

/** Validate health fields from request body. Returns an error string or null if valid. */
function validateHealthFields(body: Record<string, unknown>): { error: string } | { updates: Record<string, unknown> } {
  const updates: Record<string, unknown> = {};

  if ('heightCm' in body) {
    const v = body.heightCm;
    if (v === null) { updates.heightCm = FieldValue.delete(); }
    else if (typeof v !== 'number' || v < 50 || v > 300) return { error: 'heightCm must be between 50 and 300' };
    else updates.heightCm = v;
  }

  if ('weightKg' in body) {
    const v = body.weightKg;
    if (v === null) { updates.weightKg = FieldValue.delete(); }
    else if (typeof v !== 'number' || v < 10 || v > 500) return { error: 'weightKg must be between 10 and 500' };
    else updates.weightKg = v;
  }

  if ('dateOfBirth' in body) {
    const v = body.dateOfBirth;
    if (v === null) { updates.dateOfBirth = FieldValue.delete(); }
    else {
      if (typeof v !== 'string') return { error: 'dateOfBirth must be a valid ISO 8601 date string' };
      const d = new Date(v);
      if (isNaN(d.getTime())) return { error: 'dateOfBirth must be a valid ISO 8601 date string' };
      if (d >= new Date()) return { error: 'dateOfBirth must be in the past' };
      const age = (Date.now() - d.getTime()) / (365.25 * 24 * 60 * 60 * 1000);
      if (age < 13) return { error: 'User must be at least 13 years old' };
      updates.dateOfBirth = v;
    }
  }

  if ('workoutGoal' in body) {
    const v = body.workoutGoal;
    if (v === null) { updates.workoutGoal = FieldValue.delete(); }
    else if (!VALID_WORKOUT_GOALS.includes(v as WorkoutGoal)) return { error: `workoutGoal must be one of: ${VALID_WORKOUT_GOALS.join(', ')}` };
    else updates.workoutGoal = v;
  }

  if ('unitPreference' in body) {
    const v = body.unitPreference;
    if (v === null) { updates.unitPreference = FieldValue.delete(); }
    else if (v !== 'metric' && v !== 'imperial') return { error: "unitPreference must be 'metric' or 'imperial'" };
    else updates.unitPreference = v;
  }

  if ('healthProfilePromptDismissed' in body) {
    const v = body.healthProfilePromptDismissed;
    if (v === null) { updates.healthProfilePromptDismissed = FieldValue.delete(); }
    else if (typeof v !== 'boolean') return { error: 'healthProfilePromptDismissed must be a boolean' };
    else updates.healthProfilePromptDismissed = v;
  }

  return { updates };
}

/** Resolve the image MIME type, falling back to file extension when the browser reports an unrecognised type. */
function resolveImageMimeType(file: Express.Multer.File): string {
  if (ALLOWED_IMAGE_TYPES.includes(file.mimetype)) return file.mimetype;
  const ext = file.originalname?.toLowerCase().match(/\.[^.]+$/)?.[0] ?? '';
  const inferred = EXTENSION_TO_MIME[ext];
  if (inferred) {
    logger.info(
      { originalMimetype: file.mimetype, resolvedMimetype: inferred, originalname: file.originalname },
      'MIME type inferred from file extension',
    );
    return inferred;
  }
  return file.mimetype;
}

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

    const user = stripHealthFields(snapshot.docs[0].data() as UserProfile);
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
    const u = stripHealthFields(doc.data() as UserProfile);
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
  const { email, displayName, fcmToken, timezone } = req.body as Partial<UserProfile>;

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

  const { username, usernameLower } = await generateUniqueUsername(email, db, uid);

  const profile: UserProfile = {
    uid,
    email,
    displayName,
    username,
    usernameLower,
    createdAt: new Date().toISOString(),
    ...(fcmToken !== undefined ? { fcmToken } : {}),
    ...(typeof timezone === 'string' && timezone !== '' ? { timezone } : {}),
  };

  // Username reservation was already done atomically in generateUniqueUsername
  await docRef.set(profile);

  res.status(201).json(profile);
});

/**
 * GET /users/me
 * Returns the authenticated user's Firestore profile, or 404 if not yet created.
 */
router.get('/me', requireAuth, cacheControl(0), async (req: Request, res: Response): Promise<void> => {
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
 * GET /users/me/points
 * Returns the authenticated user's monthly points for the current month
 * and up to 12 months of history.
 */
router.get('/me/points', requireAuth, cacheControl(30), async (req: Request, res: Response): Promise<void> => {
  const uid = req.user!.uid;
  const db = getDb();

  const now = new Date();
  const currentMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;

  // Fetch all monthlyPoints docs for this user
  const snap = await db.collection('monthlyPoints').where('uid', '==', uid).get();

  type MonthlyPointsDoc = { uid: string; month: string; points: number; updatedAt: string };
  const allDocs = snap.docs.map((d) => d.data() as MonthlyPointsDoc);

  // Current month's points
  const currentDoc = allDocs.find((d) => d.month === currentMonth);
  const currentMonthPoints = {
    month: currentMonth,
    points: currentDoc?.points ?? 0,
  };

  // History: last 12 months excluding current month, sorted newest-first
  const history = allDocs
    .filter((d) => d.month !== currentMonth)
    .sort((a, b) => b.month.localeCompare(a.month))
    .slice(0, 12);

  res.json({ currentMonth: currentMonthPoints, history });
});

/**
 * POST /users/me/profile-picture
 * Uploads a profile picture, resizes to 256×256, converts to WebP, stores it in
 * Azure Blob Storage, and updates the user's Firestore document with the public URL.
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

    const uid = req.user!.uid;
    const resolvedMimetype = resolveImageMimeType(req.file);
    logger.info(
      { uid, fileSize: req.file.size, mimetype: req.file.mimetype, resolvedMimetype, originalname: req.file.originalname },
      'Profile picture upload received',
    );

    if (!ALLOWED_IMAGE_TYPES.includes(resolvedMimetype)) {
      logger.warn(
        { uid, mimetype: req.file.mimetype, originalname: req.file.originalname },
        'Profile picture rejected: unsupported file type',
      );
      res.status(400).json({ error: 'Invalid file type. Only JPEG, PNG, WebP, and HEIC are allowed.' });
      return;
    }

    const fileSize = req.file.size;

    let optimizedBuffer: Buffer;
    try {
      optimizedBuffer = await sharp(req.file.buffer)
        .rotate()
        .resize(256, 256, { fit: 'cover' })
        .webp()
        .toBuffer();
    } catch (err) {
      logger.error({ err, uid, fileSize }, 'Image processing failed');
      res.status(500).json({ error: 'Image processing failed. Please try a different image.' });
      return;
    }

    const containerClient = getContainerClient('uploads');

    // Upload original backup before cartoon conversion
    const originalBlobPath = `profile-pictures/${uid}/original.webp`;
    const originalBlobClient = containerClient.getBlockBlobClient(originalBlobPath);

    try {
      await originalBlobClient.upload(optimizedBuffer, optimizedBuffer.length, {
        blobHTTPHeaders: {
          blobContentType: 'image/webp',
          blobCacheControl: 'public, max-age=86400',
        },
      });
    } catch (err) {
      logger.error({ err, uid }, 'Azure Blob Storage upload of original failed');
      res.status(503).json({ error: 'Storage service unavailable. Please try again.' });
      return;
    }

    // Convert to cartoon style using the publicly accessible blob URL
    const originalBlobUrl = getBlobUrl(originalBlobPath);
    let avatarBuffer: Buffer;
    try {
      const cartoonResult = await createCartoonService().cartoonize(originalBlobUrl);
      if (cartoonResult === null) {
        // Cartoon conversion skipped (no token) — use original as avatar
        avatarBuffer = optimizedBuffer;
      } else {
        avatarBuffer = cartoonResult;
      }
    } catch (err) {
      logger.error({ err, uid }, 'Cartoon conversion failed');
      res.status(500).json({ error: 'Failed to create cartoon avatar. Please try again.' });
      return;
    }

    // Upload avatar (cartoon version or original fallback)
    const avatarBlobPath = `profile-pictures/${uid}/avatar.webp`;
    const avatarBlobClient = containerClient.getBlockBlobClient(avatarBlobPath);

    try {
      await avatarBlobClient.upload(avatarBuffer, avatarBuffer.length, {
        blobHTTPHeaders: {
          blobContentType: 'image/webp',
          blobCacheControl: 'public, max-age=86400',
        },
      });
    } catch (err) {
      logger.error({ err, uid }, 'Azure Blob Storage upload of cartoon avatar failed');
      res.status(503).json({ error: 'Storage service unavailable. Please try again.' });
      return;
    }

    const profilePictureUrl = `${getBlobUrl(avatarBlobPath)}?v=${Date.now()}`;

    const db = getDb();
    await db.collection('users').doc(uid).update({ profilePictureUrl });

    logger.info({ uid }, 'Profile picture upload completed');
    res.json({ profilePictureUrl });
  },
);

/**
 * DELETE /users/me/profile-picture
 * Removes the user's profile picture from Azure Blob Storage and clears the Firestore field.
 * Returns 204 on success (idempotent — succeeds even if no picture existed).
 */
router.delete('/me/profile-picture', requireAuth, async (req: Request, res: Response): Promise<void> => {
  const uid = req.user!.uid;

  const container = getContainerClient('uploads');
  await container
    .getBlockBlobClient(`profile-pictures/${uid}/original.webp`)
    .deleteIfExists();
  await container
    .getBlockBlobClient(`profile-pictures/${uid}/avatar.webp`)
    .deleteIfExists();

  // Clear the profilePictureUrl field in Firestore
  const db = getDb();
  await db.collection('users').doc(uid).update({
    profilePictureUrl: admin.firestore.FieldValue.delete(),
  });

  res.status(204).send();
});

/**
 * DELETE /users/me
 * Permanently deletes the authenticated user's account and all associated data.
 * Returns 409 if user is admin of any BurnSquads. Auth record is deleted last.
 */
router.delete('/me', requireAuth, async (req: Request, res: Response): Promise<void> => {
  const uid = req.user!.uid;
  const db = getDb();
  const BATCH_LIMIT = 500;

  // Check if user is admin of any BurnSquads
  const adminSquadsSnap = await db.collection('burnSquads').where('adminUid', '==', uid).get();
  if (!adminSquadsSnap.empty) {
    const squads = adminSquadsSnap.docs.map((d) => (d.data() as BurnSquad).name);
    res.status(409).json({ error: 'Must transfer or delete squads first', squads });
    return;
  }

  // Load profile to get usernameLower for reservation cleanup
  const userDoc = await db.collection('users').doc(uid).get();
  const usernameLower = userDoc.exists ? (userDoc.data() as UserProfile).usernameLower : undefined;

  // Helper: query and batch-delete all matching documents
  async function batchDeleteQuery(
    collectionName: string,
    field: string,
    value: string,
    label: string,
  ): Promise<void> {
    try {
      const snap = await db.collection(collectionName).where(field, '==', value).get();
      for (let i = 0; i < snap.docs.length; i += BATCH_LIMIT) {
        const batch = db.batch();
        const chunk = snap.docs.slice(i, i + BATCH_LIMIT);
        for (const doc of chunk) {
          batch.delete(doc.ref);
        }
        await batch.commit();
      }
    } catch (err) {
      logger.error({ err, collectionName, field, label }, 'Cleanup failed for collection');
    }
  }

  // Delete user profile and username reservation
  try {
    await db.collection('users').doc(uid).delete();
  } catch (err) {
    logger.error({ err }, 'Failed to delete user profile');
  }

  if (usernameLower) {
    try {
      await db.collection('usernames').doc(usernameLower).delete();
    } catch (err) {
      logger.error({ err }, 'Failed to delete username reservation');
    }
  }

  // Delete workouts
  await batchDeleteQuery('workouts', 'uid', uid, 'workouts');

  // Delete friends (uid can be in uid1 or uid2)
  await batchDeleteQuery('friends', 'uid1', uid, 'friends-uid1');
  await batchDeleteQuery('friends', 'uid2', uid, 'friends-uid2');

  // Delete friend requests
  await batchDeleteQuery('friendRequests', 'fromUid', uid, 'friendRequests-from');
  await batchDeleteQuery('friendRequests', 'toUid', uid, 'friendRequests-to');

  // Delete burn buddies
  await batchDeleteQuery('burnBuddies', 'uid1', uid, 'burnBuddies-uid1');
  await batchDeleteQuery('burnBuddies', 'uid2', uid, 'burnBuddies-uid2');

  // Delete burn buddy requests
  await batchDeleteQuery('burnBuddyRequests', 'fromUid', uid, 'burnBuddyRequests-from');
  await batchDeleteQuery('burnBuddyRequests', 'toUid', uid, 'burnBuddyRequests-to');

  // Delete burn squad join requests
  await batchDeleteQuery('burnSquadJoinRequests', 'uid', uid, 'burnSquadJoinRequests');

  // Remove from non-admin squads (update memberUids)
  try {
    const memberSquadsSnap = await db.collection('burnSquads').where('memberUids', 'array-contains', uid).get();
    for (const doc of memberSquadsSnap.docs) {
      await doc.ref.update({ memberUids: admin.firestore.FieldValue.arrayRemove(uid) });
    }
  } catch (err) {
    logger.error({ err }, 'Failed to remove user from squads');
  }

  // Handle group workouts — remove user or delete if fewer than 2 members remain
  try {
    const groupWorkoutsSnap = await db.collection('groupWorkouts').where('memberUids', 'array-contains', uid).get();
    for (const doc of groupWorkoutsSnap.docs) {
      const gw = doc.data() as GroupWorkout;
      const remaining = gw.memberUids.filter((m) => m !== uid);
      if (remaining.length < 2) {
        await doc.ref.delete();
      } else {
        await doc.ref.update({ memberUids: admin.firestore.FieldValue.arrayRemove(uid) });
      }
    }
  } catch (err) {
    logger.error({ err }, 'Failed to clean up group workouts');
  }

  // Delete profile picture from Storage
  try {
    await getContainerClient('uploads')
      .getBlockBlobClient(`profile-pictures/${uid}/avatar.webp`)
      .deleteIfExists();
  } catch (err: unknown) {
    logger.error({ err }, 'Failed to delete profile picture');
  }

  // Delete Firebase Auth user record — FINAL step
  try {
    await admin.auth().deleteUser(uid);
  } catch (err) {
    logger.error({ err }, 'Failed to delete Firebase Auth user');
  }

  res.json({ deleted: true });
});

/**
 * PUT /users/me
 * Upserts the authenticated user's profile.
 * Updates provided fields if the profile exists; creates it if it does not.
 */
router.put('/me', requireAuth, async (req: Request, res: Response): Promise<void> => {
  const uid = req.user!.uid;
  const { email, displayName, fcmToken, timezone } = req.body as Partial<UserProfile>;

  const db = getDb();
  const docRef = db.collection('users').doc(uid);
  const existing = await docRef.get();

  if (existing.exists) {
    const { gettingStartedDismissed, username: requestedUsername } = req.body as Partial<UserProfile>;
    const updates: Record<string, unknown> = {};
    if (email !== undefined) updates.email = email;
    if (displayName !== undefined) updates.displayName = displayName;
    if (fcmToken !== undefined) updates.fcmToken = fcmToken;
    if (gettingStartedDismissed !== undefined) updates.gettingStartedDismissed = gettingStartedDismissed;
    if (typeof timezone === 'string' && timezone !== '') updates.timezone = timezone;

    // Validate and apply health fields
    const healthResult = validateHealthFields(req.body as Record<string, unknown>);
    if ('error' in healthResult) {
      res.status(400).json({ error: healthResult.error });
      return;
    }
    Object.assign(updates, healthResult.updates);

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
        const { username, usernameLower } = await generateUniqueUsername(migrationEmail, db, uid);
        updates.username = username;
        updates.usernameLower = usernameLower;

        // Username reservation was already done atomically in generateUniqueUsername
        await docRef.set(updates, { merge: true });
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

    const { username, usernameLower } = await generateUniqueUsername(email, db, uid);

    const profile: UserProfile = {
      uid,
      email,
      displayName,
      username,
      usernameLower,
      createdAt: new Date().toISOString(),
      ...(fcmToken !== undefined ? { fcmToken } : {}),
      ...(typeof timezone === 'string' && timezone !== '' ? { timezone } : {}),
    };

    // Username reservation was already done atomically in generateUniqueUsername
    await docRef.set(profile);
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
  const profile = stripHealthFields(userDoc.data() as UserProfile);

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

  // 4. Get partner display names using batched multi-get (single round trip)
  const partnerUids = burnBuddies.map((bb) => (bb.uid1 === targetUid ? bb.uid2 : bb.uid1));
  const partnerNames: Record<string, string> = {};
  if (partnerUids.length > 0) {
    const partnerRefs = partnerUids.map((uid) => db.collection('users').doc(uid));
    const partnerDocs = await db.getAll(...partnerRefs);
    partnerDocs.forEach((doc) => {
      if (doc.exists) {
        const data = doc.data() as UserProfile;
        partnerNames[data.uid] = data.displayName;
      }
    });
  }

  // 5. Get group workouts using batched 'in' queries (max 30 per query)
  const allReferenceIds = [
    ...burnBuddies.map((bb) => bb.id),
    ...burnSquads.map((sq) => sq.id),
  ];

  const groupWorkoutsByRef: Record<string, GroupWorkout[]> = {};
  for (const refId of allReferenceIds) {
    groupWorkoutsByRef[refId] = [];
  }

  const CHUNK_SIZE = 30;
  for (let i = 0; i < allReferenceIds.length; i += CHUNK_SIZE) {
    const chunk = allReferenceIds.slice(i, i + CHUNK_SIZE);
    const snap = await db.collection('groupWorkouts').where('referenceId', 'in', chunk).get();
    for (const doc of snap.docs) {
      const gw = doc.data() as GroupWorkout;
      groupWorkoutsByRef[gw.referenceId]?.push(gw);
    }
  }

  // 6. Calculate highest active streak and highest streak ever across all relationships
  let highestActiveStreak: ProfileStats['highestActiveStreak'] = null;
  let highestActiveStreakLast7Days: ProfileStats['highestActiveStreakLast7Days'] = null;
  let highestStreakEver: ProfileStats['highestStreakEver'] = null;

  for (const bb of burnBuddies) {
    const gws = groupWorkoutsByRef[bb.id] ?? [];
    const partnerUid = bb.uid1 === targetUid ? bb.uid2 : bb.uid1;
    const name = partnerNames[partnerUid] ?? 'Unknown';

    const { burnStreak, last7Days } = calculateStreaks(gws);
    if (burnStreak > 0 && (!highestActiveStreak || burnStreak > highestActiveStreak.value)) {
      highestActiveStreak = { value: burnStreak, name };
      highestActiveStreakLast7Days = last7Days;
    }

    const hse = calculateHighestStreakEver(gws);
    if (hse.value > 0 && (!highestStreakEver || hse.value > highestStreakEver.value)) {
      highestStreakEver = { value: hse.value, date: hse.date, name };
    }
  }

  for (const sq of burnSquads) {
    const gws = groupWorkoutsByRef[sq.id] ?? [];
    const name = sq.name;

    const { burnStreak, last7Days } = calculateStreaks(gws);
    if (burnStreak > 0 && (!highestActiveStreak || burnStreak > highestActiveStreak.value)) {
      highestActiveStreak = { value: burnStreak, name };
      highestActiveStreakLast7Days = last7Days;
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
  let pendingBuddyRequestId: string | null = null;
  let burnBuddyId: string | null = null;

  const isBuddy = burnBuddies.some(
    (bb) =>
      (bb.uid1 === requesterUid && bb.uid2 === targetUid) ||
      (bb.uid1 === targetUid && bb.uid2 === requesterUid),
  );

  if (isBuddy) {
    buddyRelationshipStatus = 'buddies';
    const [bbUid1, bbUid2] = [requesterUid, targetUid].sort();
    burnBuddyId = `${bbUid1}_${bbUid2}`;
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
      pendingBuddyRequestId = sentSnap.docs[0]!.id;
    } else if (!receivedSnap.empty) {
      buddyRelationshipStatus = 'pending_received';
      pendingBuddyRequestId = receivedSnap.docs[0]!.id;
    }
  }

  // 9. Return ProfileStats
  const profileStats: ProfileStats = {
    displayName: profile.displayName,
    username: profile.username,
    profilePictureUrl: profile.profilePictureUrl,
    highestActiveStreak,
    highestActiveStreakLast7Days,
    highestStreakEver,
    firstWorkoutDate,
    workoutsAllTime: workouts.length,
    workoutsThisMonth,
    buddyRelationshipStatus,
    friendshipStatus: 'friends' as const,
    pendingBuddyRequestId,
    burnBuddyId,
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

  const profile = stripHealthFields(doc.data() as UserProfile);
  res.json({ uid: profile.uid, displayName: profile.displayName, email: profile.email, profilePictureUrl: profile.profilePictureUrl });
});

export default router;
