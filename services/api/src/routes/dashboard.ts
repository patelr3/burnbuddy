import { Router, type Request, type Response } from 'express';
import type {
  UserProfile,
  BurnBuddy,
  BurnBuddyRequest,
  BurnSquad,
  BurnSquadJoinRequest,
  GroupWorkout,
  Workout,
  ActivePartnerWorkout,
} from '@burnbuddy/shared';
import { GROUP_WORKOUT_WINDOW_MS } from '@burnbuddy/shared';
import { requireAuth } from '../middleware/auth';
import { cacheControl } from '../middleware/cache-control';
import { getDb } from '../lib/firestore';
import { calculateStreaks } from '../services/streak-calculator';

const router = Router();

const CHUNK_SIZE = 30;

/**
 * Splits an array into chunks of at most `size` elements.
 */
function chunk<T>(arr: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let i = 0; i < arr.length; i += size) {
    chunks.push(arr.slice(i, i + size));
  }
  return chunks;
}

interface EnrichedBurnBuddy extends BurnBuddy {
  partnerUid: string;
  partnerDisplayName: string;
  streaks: { burnStreak: number; supernovaStreak: number };
}

interface EnrichedBurnSquad extends BurnSquad {
  streaks: { burnStreak: number; supernovaStreak: number };
}

interface DashboardResponse {
  user: UserProfile;
  burnBuddies: EnrichedBurnBuddy[];
  burnSquads: EnrichedBurnSquad[];
  groupWorkouts: GroupWorkout[];
  buddyRequests: {
    incoming: (BurnBuddyRequest & { fromDisplayName?: string })[];
    outgoing: BurnBuddyRequest[];
  };
  squadJoinRequests: {
    incoming: (BurnSquadJoinRequest & { squadName?: string })[];
    outgoing: (BurnSquadJoinRequest & { squadName?: string })[];
  };
  activeWorkout: Workout | null;
  partnerActivity: {
    groupWorkoutWindowMs: number;
    activePartnerWorkouts: ActivePartnerWorkout[];
  };
}

/**
 * GET /dashboard
 * Returns all data needed for the dashboard in a single request.
 * Fetches user profile, burn buddies, burn squads, group workouts,
 * buddy/squad requests, active workout, and partner activity in parallel.
 */
router.get('/', requireAuth, cacheControl(5), async (req: Request, res: Response): Promise<void> => {
  const uid = req.user!.uid;
  const db = getDb();

  // ── Phase 1: Fetch core data in parallel ──────────────────────────────────
  const [
    userDoc,
    bbSnap1,
    bbSnap2,
    squadsSnap,
    groupWorkoutsSnap,
    incomingBuddyReqSnap,
    outgoingBuddyReqSnap,
    incomingSquadReqSnap,
    outgoingSquadReqSnap,
    activeWorkoutSnap,
  ] = await Promise.all([
    // User profile
    db.collection('users').doc(uid).get(),
    // Burn buddies (two queries since uid can be uid1 or uid2)
    db.collection('burnBuddies').where('uid1', '==', uid).get(),
    db.collection('burnBuddies').where('uid2', '==', uid).get(),
    // Burn squads
    db.collection('burnSquads').where('memberUids', 'array-contains', uid).get(),
    // Group workouts
    db.collection('groupWorkouts').where('memberUids', 'array-contains', uid).get(),
    // Buddy requests
    db.collection('burnBuddyRequests').where('toUid', '==', uid).where('status', '==', 'pending').get(),
    db.collection('burnBuddyRequests').where('fromUid', '==', uid).where('status', '==', 'pending').get(),
    // Squad join requests
    db.collection('burnSquadJoinRequests').where('toUid', '==', uid).where('status', '==', 'pending').get(),
    db.collection('burnSquadJoinRequests').where('fromUid', '==', uid).where('status', '==', 'pending').get(),
    // Active workout
    db.collection('workouts').where('uid', '==', uid).where('status', '==', 'active').get(),
  ]);

  if (!userDoc.exists) {
    res.status(404).json({ error: 'User profile not found' });
    return;
  }

  const user = userDoc.data() as UserProfile;

  // ── Parse core data ───────────────────────────────────────────────────────
  const burnBuddies = [
    ...bbSnap1.docs.map((d: { data: () => unknown }) => d.data() as BurnBuddy),
    ...bbSnap2.docs.map((d: { data: () => unknown }) => d.data() as BurnBuddy),
  ];

  const burnSquads = squadsSnap.docs.map((d: { data: () => unknown }) => d.data() as BurnSquad);

  const groupWorkouts = groupWorkoutsSnap.docs.map(
    (d: { data: () => unknown }) => d.data() as GroupWorkout,
  );

  const buddyRequests = {
    incoming: incomingBuddyReqSnap.docs.map(
      (d: { data: () => unknown }) => d.data() as BurnBuddyRequest,
    ),
    outgoing: outgoingBuddyReqSnap.docs.map(
      (d: { data: () => unknown }) => d.data() as BurnBuddyRequest,
    ),
  };

  const incomingSquadRequests = incomingSquadReqSnap.docs.map(
    (d: { data: () => unknown }) => d.data() as BurnSquadJoinRequest,
  );
  const outgoingSquadRequests = outgoingSquadReqSnap.docs.map(
    (d: { data: () => unknown }) => d.data() as BurnSquadJoinRequest,
  );

  const workoutDocs = activeWorkoutSnap.docs.map(
    (d: { data: () => unknown }) => d.data() as Workout,
  );
  const activeWorkout = workoutDocs.length > 0 ? workoutDocs[0]! : null;

  // ── Phase 2: Enrich buddies with partner names (batched multi-get) ────────
  const partnerUids = burnBuddies.map((bb) => (bb.uid1 === uid ? bb.uid2 : bb.uid1));
  const partnerNames: Record<string, string> = {};

  if (partnerUids.length > 0) {
    const partnerRefs = partnerUids.map((pUid) => db.collection('users').doc(pUid));
    const partnerDocs = await db.getAll(...partnerRefs);
    partnerDocs.forEach((doc: { exists: boolean; data: () => unknown }) => {
      if (doc.exists) {
        const data = doc.data() as UserProfile;
        partnerNames[data.uid] = data.displayName;
      }
    });
  }

  // ── Phase 2b: Enrich incoming buddy requests with sender display names ───
  const requestFromUids = buddyRequests.incoming
    .map((r) => r.fromUid)
    .filter((fuid) => !partnerNames[fuid]);

  if (requestFromUids.length > 0) {
    const reqRefs = requestFromUids.map((fuid) => db.collection('users').doc(fuid));
    const reqDocs = await db.getAll(...reqRefs);
    reqDocs.forEach((doc: { exists: boolean; data: () => unknown }) => {
      if (doc.exists) {
        const data = doc.data() as UserProfile;
        partnerNames[data.uid] = data.displayName;
      }
    });
  }

  // ── Phase 3: Calculate streaks using group workouts ───────────────────────
  // Index group workouts by referenceId for fast lookup
  const gwByRef: Record<string, GroupWorkout[]> = {};
  for (const gw of groupWorkouts) {
    if (!gwByRef[gw.referenceId]) gwByRef[gw.referenceId] = [];
    gwByRef[gw.referenceId]!.push(gw);
  }

  const enrichedBuddies: EnrichedBurnBuddy[] = burnBuddies.map((bb) => {
    const partnerUid = bb.uid1 === uid ? bb.uid2 : bb.uid1;
    const partnerDisplayName = partnerNames[partnerUid] ?? 'Unknown';
    const gws = gwByRef[bb.id] ?? [];
    const streaks = calculateStreaks(gws);
    return { ...bb, partnerUid, partnerDisplayName, streaks };
  });

  const enrichedSquads: EnrichedBurnSquad[] = burnSquads.map((sq) => {
    const gws = gwByRef[sq.id] ?? [];
    const streaks = calculateStreaks(gws);
    return { ...sq, streaks };
  });

  // ── Phase 4: Enrich squad join requests with squad names ──────────────────
  const squadNameMap: Record<string, string> = {};
  for (const sq of burnSquads) {
    squadNameMap[sq.id] = sq.name;
  }

  // Collect squad IDs we don't already have
  const unknownSquadIds = new Set<string>();
  for (const jr of [...incomingSquadRequests, ...outgoingSquadRequests]) {
    if (!squadNameMap[jr.squadId]) unknownSquadIds.add(jr.squadId);
  }

  // Batch-fetch unknown squad names
  if (unknownSquadIds.size > 0) {
    const unknownIds = [...unknownSquadIds];
    const refs = unknownIds.map((id) => db.collection('burnSquads').doc(id));
    const docs = await db.getAll(...refs);
    docs.forEach((doc: { exists: boolean; data: () => unknown }) => {
      if (doc.exists) {
        const data = doc.data() as BurnSquad;
        squadNameMap[data.id] = data.name;
      }
    });
  }

  const squadJoinRequests = {
    incoming: incomingSquadRequests.map((jr) => ({
      ...jr,
      squadName: squadNameMap[jr.squadId] ?? 'Unknown Squad',
    })),
    outgoing: outgoingSquadRequests.map((jr) => ({
      ...jr,
      squadName: squadNameMap[jr.squadId] ?? 'Unknown Squad',
    })),
  };

  // ── Phase 5: Partner activity (batched) ───────────────────────────────────
  const cutoff = new Date(Date.now() - GROUP_WORKOUT_WINDOW_MS).toISOString();
  const buddyPartnerUids = burnBuddies.map((b) => (b.uid1 === uid ? b.uid2 : b.uid1));
  const squadMemberUids = burnSquads.flatMap((s) => s.memberUids.filter((m) => m !== uid));
  const allPartnerUids = [...new Set([...buddyPartnerUids, ...squadMemberUids])];

  const activeWorkoutsByUid = new Map<string, string>();

  const partnerChunks = chunk(allPartnerUids, CHUNK_SIZE);
  for (const ch of partnerChunks) {
    const snap = await db.collection('workouts').where('uid', 'in', ch).get();
    for (const doc of snap.docs) {
      const w = doc.data() as Workout;
      if (w.status === 'active' && w.startedAt >= cutoff) {
        const existing = activeWorkoutsByUid.get(w.uid);
        if (!existing || w.startedAt < existing) {
          activeWorkoutsByUid.set(w.uid, w.startedAt);
        }
      }
    }
  }

  const activePartnerWorkouts: ActivePartnerWorkout[] = [];

  for (const buddy of burnBuddies) {
    const pUid = buddy.uid1 === uid ? buddy.uid2 : buddy.uid1;
    const earliest = activeWorkoutsByUid.get(pUid);
    if (earliest) {
      activePartnerWorkouts.push({
        type: 'buddy',
        referenceId: buddy.id,
        earliestStartedAt: earliest,
      });
    }
  }

  for (const squad of burnSquads) {
    const otherMemberUids = squad.memberUids.filter((m) => m !== uid);
    let earliestStartedAt: string | null = null;
    for (const memberUid of otherMemberUids) {
      const startedAt = activeWorkoutsByUid.get(memberUid);
      if (startedAt && (earliestStartedAt === null || startedAt < earliestStartedAt)) {
        earliestStartedAt = startedAt;
      }
    }
    if (earliestStartedAt !== null) {
      activePartnerWorkouts.push({
        type: 'squad',
        referenceId: squad.id,
        earliestStartedAt,
      });
    }
  }

  // ── Build response ────────────────────────────────────────────────────────
  const enrichedBuddyRequests = {
    incoming: buddyRequests.incoming.map((r) => ({
      ...r,
      fromDisplayName: partnerNames[r.fromUid],
    })),
    outgoing: buddyRequests.outgoing,
  };

  const response: DashboardResponse = {
    user,
    burnBuddies: enrichedBuddies,
    burnSquads: enrichedSquads,
    groupWorkouts,
    buddyRequests: enrichedBuddyRequests,
    squadJoinRequests,
    activeWorkout,
    partnerActivity: {
      groupWorkoutWindowMs: GROUP_WORKOUT_WINDOW_MS,
      activePartnerWorkouts,
    },
  };

  res.json(response);
});

export default router;
