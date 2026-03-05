import { randomUUID } from 'crypto';
import { Router, type Request, type Response } from 'express';
import type { BurnSquad, BurnSquadJoinRequest, GroupWorkout } from '@burnbuddy/shared';
import { requireAuth } from '../middleware/auth';
import { getDb } from '../lib/firestore';
import { calculateStreaks } from '../services/streak-calculator';

const router = Router();

/**
 * POST /burn-squads
 * Creates a new Burn Squad. Creator becomes admin and first member.
 * Sends join requests to specified friend uids.
 */
router.post('/', requireAuth, async (req: Request, res: Response): Promise<void> => {
  const adminUid = req.user!.uid;
  const { name, inviteUids, workoutSchedule } = req.body as {
    name?: string;
    inviteUids?: string[];
    workoutSchedule?: import('@burnbuddy/shared').WorkoutSchedule;
  };

  if (!name) {
    res.status(400).json({ error: 'name is required' });
    return;
  }

  const db = getDb();
  const squadId = randomUUID();
  const now = new Date().toISOString();

  const squad: BurnSquad = {
    id: squadId,
    name,
    adminUid,
    memberUids: [adminUid],
    settings: {
      onlyAdminsCanAddMembers: false,
      ...(workoutSchedule && { workoutSchedule }),
    },
    createdAt: now,
  };

  await db.collection('burnSquads').doc(squadId).set(squad);

  const joinRequests: BurnSquadJoinRequest[] = [];

  if (Array.isArray(inviteUids) && inviteUids.length > 0) {
    for (const toUid of inviteUids) {
      if (toUid === adminUid) continue;

      // Verify friendship before sending a join request
      const [uid1, uid2] = [adminUid, toUid].sort();
      const friendDoc = await db.collection('friends').doc(`${uid1}_${uid2}`).get();
      if (!friendDoc.exists) continue;

      const requestId = randomUUID();
      const joinRequest: BurnSquadJoinRequest = {
        id: requestId,
        squadId,
        fromUid: adminUid,
        toUid,
        status: 'pending',
        createdAt: now,
      };
      await db.collection('burnSquadJoinRequests').doc(requestId).set(joinRequest);
      joinRequests.push(joinRequest);
    }
  }

  res.status(201).json({ squad, joinRequests });
});

/**
 * GET /burn-squads
 * Returns all Burn Squads the authenticated user is a member of.
 */
router.get('/', requireAuth, async (req: Request, res: Response): Promise<void> => {
  const uid = req.user!.uid;
  const db = getDb();

  const snap = await db.collection('burnSquads').where('memberUids', 'array-contains', uid).get();
  const squads = snap.docs.map((doc) => doc.data() as BurnSquad);

  res.json(squads);
});

/**
 * GET /burn-squads/join-requests
 * Returns pending incoming and outgoing Burn Squad join requests for the authenticated user,
 * enriched with the squad name.
 * NOTE: must be registered before /:id routes to avoid Express capturing 'join-requests' as :id.
 */
router.get('/join-requests', requireAuth, async (req: Request, res: Response): Promise<void> => {
  const uid = req.user!.uid;
  const db = getDb();

  const [incomingSnap, outgoingSnap] = await Promise.all([
    db
      .collection('burnSquadJoinRequests')
      .where('toUid', '==', uid)
      .where('status', '==', 'pending')
      .get(),
    db
      .collection('burnSquadJoinRequests')
      .where('fromUid', '==', uid)
      .where('status', '==', 'pending')
      .get(),
  ]);

  const incomingRequests = incomingSnap.docs.map((doc) => doc.data() as BurnSquadJoinRequest);
  const outgoingRequests = outgoingSnap.docs.map((doc) => doc.data() as BurnSquadJoinRequest);

  const [enrichedIncoming, enrichedOutgoing] = await Promise.all([
    Promise.all(
      incomingRequests.map(async (joinReq) => {
        try {
          const squadDoc = await db.collection('burnSquads').doc(joinReq.squadId).get();
          const squadName = squadDoc.exists ? (squadDoc.data() as BurnSquad).name : 'Unknown Squad';
          return { ...joinReq, squadName };
        } catch {
          return { ...joinReq, squadName: 'Unknown Squad' };
        }
      }),
    ),
    Promise.all(
      outgoingRequests.map(async (joinReq) => {
        try {
          const squadDoc = await db.collection('burnSquads').doc(joinReq.squadId).get();
          const squadName = squadDoc.exists ? (squadDoc.data() as BurnSquad).name : 'Unknown Squad';
          return { ...joinReq, squadName };
        } catch {
          return { ...joinReq, squadName: 'Unknown Squad' };
        }
      }),
    ),
  ]);

  res.json({ incoming: enrichedIncoming, outgoing: enrichedOutgoing });
});

/**
 * GET /burn-squads/:id
 * Returns a single Burn Squad (member only).
 */
router.get('/:id', requireAuth, async (req: Request, res: Response): Promise<void> => {
  const uid = req.user!.uid;
  const squadId = req.params['id'] as string;
  const db = getDb();

  const squadDoc = await db.collection('burnSquads').doc(squadId).get();

  if (!squadDoc.exists) {
    res.status(404).json({ error: 'Burn Squad not found' });
    return;
  }

  const squad = squadDoc.data() as BurnSquad;

  if (!squad.memberUids.includes(uid)) {
    res.status(403).json({ error: 'You are not a member of this Burn Squad' });
    return;
  }

  res.json(squad);
});

/**
 * PUT /burn-squads/:id
 * Updates squad name and/or settings (admin only).
 */
router.put('/:id', requireAuth, async (req: Request, res: Response): Promise<void> => {
  const uid = req.user!.uid;
  const squadId = req.params['id'] as string;
  const db = getDb();

  const squadDoc = await db.collection('burnSquads').doc(squadId).get();

  if (!squadDoc.exists) {
    res.status(404).json({ error: 'Burn Squad not found' });
    return;
  }

  const squad = squadDoc.data() as BurnSquad;

  if (squad.adminUid !== uid) {
    res.status(403).json({ error: 'Only the admin can update this squad' });
    return;
  }

  const { name, settings } = req.body as {
    name?: string;
    settings?: Partial<BurnSquad['settings']>;
  };

  const updates: Partial<BurnSquad> = {};
  if (name !== undefined) updates.name = name;
  if (settings !== undefined) updates.settings = { ...squad.settings, ...settings };

  await db.collection('burnSquads').doc(squadId).update(updates);

  const updated = { ...squad, ...updates };
  res.json(updated);
});

/**
 * POST /burn-squads/:id/join-requests/:requestId/accept
 * Accepts a squad join request; adds the user to the squad's memberUids.
 */
router.post(
  '/:id/join-requests/:requestId/accept',
  requireAuth,
  async (req: Request, res: Response): Promise<void> => {
    const uid = req.user!.uid;
    const squadId = req.params['id'] as string;
    const requestId = req.params['requestId'] as string;
    const db = getDb();

    const requestDoc = await db.collection('burnSquadJoinRequests').doc(requestId).get();

    if (!requestDoc.exists) {
      res.status(404).json({ error: 'Join request not found' });
      return;
    }

    const joinRequest = requestDoc.data() as BurnSquadJoinRequest;

    if (joinRequest.toUid !== uid) {
      res.status(403).json({ error: 'You can only accept join requests sent to you' });
      return;
    }

    if (joinRequest.squadId !== squadId) {
      res.status(400).json({ error: 'Join request does not belong to this squad' });
      return;
    }

    if (joinRequest.status !== 'pending') {
      res.status(409).json({ error: 'Join request is no longer pending' });
      return;
    }

    // Read squad to get current memberUids before updating
    const squadDoc = await db.collection('burnSquads').doc(squadId).get();
    if (!squadDoc.exists) {
      res.status(404).json({ error: 'Burn Squad not found' });
      return;
    }

    const squad = squadDoc.data() as BurnSquad;
    const newMemberUids = [...squad.memberUids, uid];

    await db.collection('burnSquadJoinRequests').doc(requestId).update({ status: 'accepted' });
    await db.collection('burnSquads').doc(squadId).update({ memberUids: newMemberUids });

    res.json({ success: true, squadId, requestId });
  },
);

/**
 * POST /burn-squads/:id/members
 * Sends a join request to add a friend to the squad.
 * Respects the onlyAdminsCanAddMembers setting.
 */
router.post(
  '/:id/members',
  requireAuth,
  async (req: Request, res: Response): Promise<void> => {
    const uid = req.user!.uid;
    const squadId = req.params['id'] as string;
    const { memberUid } = req.body as { memberUid?: string };

    if (!memberUid) {
      res.status(400).json({ error: 'memberUid is required' });
      return;
    }

    const db = getDb();

    const squadDoc = await db.collection('burnSquads').doc(squadId).get();

    if (!squadDoc.exists) {
      res.status(404).json({ error: 'Burn Squad not found' });
      return;
    }

    const squad = squadDoc.data() as BurnSquad;

    if (!squad.memberUids.includes(uid)) {
      res.status(403).json({ error: 'You are not a member of this Burn Squad' });
      return;
    }

    if (squad.settings.onlyAdminsCanAddMembers && squad.adminUid !== uid) {
      res.status(403).json({ error: 'Only admins can add members to this squad' });
      return;
    }

    // Verify friendship
    const [uid1, uid2] = [uid, memberUid].sort();
    const friendDoc = await db.collection('friends').doc(`${uid1}_${uid2}`).get();

    if (!friendDoc.exists) {
      res.status(400).json({ error: 'You must be friends with the user you want to add' });
      return;
    }

    const requestId = randomUUID();
    const joinRequest: BurnSquadJoinRequest = {
      id: requestId,
      squadId,
      fromUid: uid,
      toUid: memberUid,
      status: 'pending',
      createdAt: new Date().toISOString(),
    };

    await db.collection('burnSquadJoinRequests').doc(requestId).set(joinRequest);
    res.status(201).json(joinRequest);
  },
);

/**
 * GET /burn-squads/:id/streaks
 * Returns burnStreak and supernovaStreak for the given Burn Squad.
 */
router.get(
  '/:id/streaks',
  requireAuth,
  async (req: Request, res: Response): Promise<void> => {
    const uid = req.user!.uid;
    const squadId = req.params['id'] as string;
    const db = getDb();

    const squadDoc = await db.collection('burnSquads').doc(squadId).get();

    if (!squadDoc.exists) {
      res.status(404).json({ error: 'Burn Squad not found' });
      return;
    }

    const squad = squadDoc.data() as BurnSquad;

    if (!squad.memberUids.includes(uid)) {
      res.status(403).json({ error: 'You are not a member of this Burn Squad' });
      return;
    }

    // Fetch all GroupWorkouts for this squad
    const groupWorkoutSnap = await db
      .collection('groupWorkouts')
      .where('referenceId', '==', squadId)
      .get();

    const groupWorkouts = groupWorkoutSnap.docs.map((doc) => doc.data() as GroupWorkout);
    const streaks = calculateStreaks(groupWorkouts);

    res.json(streaks);
  },
);

/**
 * PUT /burn-squads/:id/settings
 * Updates squad settings (admin only).
 */
router.put(
  '/:id/settings',
  requireAuth,
  async (req: Request, res: Response): Promise<void> => {
    const uid = req.user!.uid;
    const squadId = req.params['id'] as string;
    const db = getDb();

    const squadDoc = await db.collection('burnSquads').doc(squadId).get();

    if (!squadDoc.exists) {
      res.status(404).json({ error: 'Burn Squad not found' });
      return;
    }

    const squad = squadDoc.data() as BurnSquad;

    if (squad.adminUid !== uid) {
      res.status(403).json({ error: 'Only the admin can update squad settings' });
      return;
    }

    const { settings } = req.body as { settings?: Partial<BurnSquad['settings']> };

    if (!settings) {
      res.status(400).json({ error: 'settings is required' });
      return;
    }

    await db.collection('burnSquads').doc(squadId).update({ settings: { ...squad.settings, ...settings } });
    res.json({ success: true });
  },
);

/**
 * DELETE /burn-squads/:id
 * Deletes the squad (admin only).
 */
router.delete(
  '/:id',
  requireAuth,
  async (req: Request, res: Response): Promise<void> => {
    const uid = req.user!.uid;
    const squadId = req.params['id'] as string;
    const db = getDb();

    const squadDoc = await db.collection('burnSquads').doc(squadId).get();

    if (!squadDoc.exists) {
      res.status(404).json({ error: 'Burn Squad not found' });
      return;
    }

    const squad = squadDoc.data() as BurnSquad;

    if (squad.adminUid !== uid) {
      res.status(403).json({ error: 'Only the admin can delete this squad' });
      return;
    }

    await db.collection('burnSquads').doc(squadId).delete();
    res.status(204).send();
  },
);

export default router;
