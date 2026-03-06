import { randomUUID } from 'crypto';
import { Router, type Request, type Response } from 'express';
import type { Friend, FriendRequest, UserProfile } from '@burnbuddy/shared';
import { requireAuth } from '../middleware/auth';
import { cacheControl } from '../middleware/cache-control';
import { getDb } from '../lib/firestore';

const router = Router();

/**
 * POST /friends/requests
 * Sends a friend request to another user by uid.
 */
router.post('/requests', requireAuth, async (req: Request, res: Response): Promise<void> => {
  const fromUid = req.user!.uid;
  const { toUid } = req.body as { toUid?: string };

  if (!toUid) {
    res.status(400).json({ error: 'toUid is required' });
    return;
  }

  if (toUid === fromUid) {
    res.status(400).json({ error: 'Cannot send a friend request to yourself' });
    return;
  }

  const db = getDb();

  // Check if a pending request already exists (from this user to the target)
  const existing = await db
    .collection('friendRequests')
    .where('fromUid', '==', fromUid)
    .where('toUid', '==', toUid)
    .where('status', '==', 'pending')
    .limit(1)
    .get();

  if (!existing.empty) {
    res.status(409).json({ error: 'A pending friend request already exists' });
    return;
  }

  const id = randomUUID();
  const friendRequest: FriendRequest = {
    id,
    fromUid,
    toUid,
    status: 'pending',
    createdAt: new Date().toISOString(),
  };

  await db.collection('friendRequests').doc(id).set(friendRequest);
  res.status(201).json(friendRequest);
});

/**
 * GET /friends/requests
 * Returns pending incoming and outgoing friend requests for the authenticated user.
 */
router.get('/requests', requireAuth, async (req: Request, res: Response): Promise<void> => {
  const uid = req.user!.uid;
  const db = getDb();

  const [incomingSnap, outgoingSnap] = await Promise.all([
    db.collection('friendRequests').where('toUid', '==', uid).where('status', '==', 'pending').get(),
    db
      .collection('friendRequests')
      .where('fromUid', '==', uid)
      .where('status', '==', 'pending')
      .get(),
  ]);

  res.json({
    incoming: incomingSnap.docs.map((doc) => doc.data() as FriendRequest),
    outgoing: outgoingSnap.docs.map((doc) => doc.data() as FriendRequest),
  });
});

/**
 * POST /friends/requests/:id/accept
 * Accepts a friend request; creates a bidirectional friendship document.
 */
router.post(
  '/requests/:id/accept',
  requireAuth,
  async (req: Request, res: Response): Promise<void> => {
    const uid = req.user!.uid;
    const id = req.params['id'] as string;
    const db = getDb();

    const requestDoc = await db.collection('friendRequests').doc(id).get();

    if (!requestDoc.exists) {
      res.status(404).json({ error: 'Friend request not found' });
      return;
    }

    const friendRequest = requestDoc.data() as FriendRequest;

    if (friendRequest.toUid !== uid) {
      res.status(403).json({ error: 'You can only accept friend requests sent to you' });
      return;
    }

    if (friendRequest.status !== 'pending') {
      res.status(409).json({ error: 'Friend request is no longer pending' });
      return;
    }

    await db.collection('friendRequests').doc(id).update({ status: 'accepted' });

    const createdAt = new Date().toISOString();
    const [uid1, uid2] = [friendRequest.fromUid, uid].sort();
    const friendship: Friend = { uid1, uid2, createdAt };
    const friendDocId = `${uid1}_${uid2}`;

    await db.collection('friends').doc(friendDocId).set(friendship);

    res.json({ success: true, friendRequestId: id });
  },
);

/**
 * GET /friends
 * Returns all accepted friends for the authenticated user, enriched with profile data.
 */
router.get('/', requireAuth, cacheControl(30), async (req: Request, res: Response): Promise<void> => {
  const uid = req.user!.uid;
  const db = getDb();

  const [uid1Snap, uid2Snap] = await Promise.all([
    db.collection('friends').where('uid1', '==', uid).get(),
    db.collection('friends').where('uid2', '==', uid).get(),
  ]);

  const friendDocs = [...uid1Snap.docs, ...uid2Snap.docs];

  const enriched = await Promise.all(
    friendDocs.map(async (doc) => {
      const friend = doc.data() as Friend;
      const otherUid = friend.uid1 === uid ? friend.uid2 : friend.uid1;
      const userDoc = await db.collection('users').doc(otherUid).get();
      if (!userDoc.exists) return null;
      const profile = userDoc.data() as UserProfile;
      return { uid: otherUid, displayName: profile.displayName, email: profile.email, username: profile.username, profilePictureUrl: profile.profilePictureUrl, createdAt: friend.createdAt };
    }),
  );

  res.json(enriched.filter((f) => f !== null));
});

/**
 * DELETE /friends/:uid
 * Removes a friendship without requiring the other user's approval.
 */
router.delete('/:uid', requireAuth, async (req: Request, res: Response): Promise<void> => {
  const currentUid = req.user!.uid;
  const targetUid = req.params['uid'] as string;
  const db = getDb();

  const [uid1, uid2] = [currentUid, targetUid].sort();
  const friendDocId = `${uid1}_${uid2}`;
  const friendDoc = await db.collection('friends').doc(friendDocId).get();

  if (!friendDoc.exists) {
    res.status(404).json({ error: 'Friendship not found' });
    return;
  }

  await db.collection('friends').doc(friendDocId).delete();
  res.status(204).send();
});

export default router;
