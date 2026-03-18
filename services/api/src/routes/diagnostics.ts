import { Router, type Request, type Response } from 'express';
import sharp from 'sharp';
import { requireAuth } from '../middleware/auth';
import { getContainerClient } from '../lib/storage';
import { getDb } from '../lib/firestore';
import { logger } from '../lib/logger';

const router = Router();

/**
 * GET /diagnostics
 * Reports health of storage and image processing subsystems.
 */
router.get('/', requireAuth, async (_req: Request, res: Response) => {
  const result: Record<string, unknown> = {};

  // Sharp / image processing info
  try {
    result.sharp = {
      version: sharp.versions.sharp,
      heifSupport: sharp.format.heif.input.buffer,
      heifFileSuffixes: sharp.format.heif.input.fileSuffix,
    };
  } catch (err) {
    logger.error({ err }, 'Diagnostics: failed to read sharp info');
    result.sharp = { error: 'Failed to read sharp info' };
  }

  // Storage info
  try {
    const storageAccountUrl = process.env.AZURE_STORAGE_ACCOUNT_URL ?? '';
    const containerName = 'uploads';
    const containerClient = getContainerClient(containerName);
    const containerExists = await containerClient.exists();

    result.storage = {
      storageAccountUrl,
      containerName,
      containerExists,
    };
  } catch (err) {
    logger.error({ err }, 'Diagnostics: failed to check storage');
    result.storage = { error: 'Failed to check container' };
  }

  res.json(result);
});

// ---------------------------------------------------------------------------
// GET /diagnostics/relationships
// Reports integrity of relationship data (burn buddies, friends, requests).
// ---------------------------------------------------------------------------

const MAX_IDS_PER_CATEGORY = 50;

interface RelationshipIssue {
  docId: string;
  collection: string;
  details: string;
}

interface RelationshipReport {
  orphanPendingBBRequests: { count: number; ids: string[] };
  orphanPendingFriendRequests: { count: number; ids: string[] };
  bbWithoutFriendship: { count: number; ids: string[] };
  invalidUidRequests: { count: number; ids: string[] };
  totalScanned: number;
}

router.get(
  '/relationships',
  requireAuth,
  async (_req: Request, res: Response) => {
    try {
      const db = getDb();

      const [bbRequestsSnap, friendRequestsSnap, bbSnap, friendsSnap, usersSnap] =
        await Promise.all([
          db.collection('burnBuddyRequests').where('status', '==', 'pending').get(),
          db.collection('friendRequests').where('status', '==', 'pending').get(),
          db.collection('burnBuddies').get(),
          db.collection('friends').get(),
          db.collection('users').get(),
        ]);

      // Build lookup sets
      const userIds = new Set(usersSnap.docs.map((d) => d.id));

      const bbPairs = new Set(
        bbSnap.docs.map((d) => {
          const data = d.data();
          const [uid1, uid2] = [data.uid1, data.uid2].sort();
          return `${uid1}_${uid2}`;
        }),
      );

      const friendPairs = new Set(
        friendsSnap.docs.map((d) => {
          const data = d.data();
          const [uid1, uid2] = [data.uid1, data.uid2].sort();
          return `${uid1}_${uid2}`;
        }),
      );

      const orphanBB: RelationshipIssue[] = [];
      const orphanFriend: RelationshipIssue[] = [];
      const bbNoFriend: RelationshipIssue[] = [];
      const invalidUid: RelationshipIssue[] = [];

      // (a) Orphan pending burnBuddyRequests where burnBuddy already exists
      for (const doc of bbRequestsSnap.docs) {
        const data = doc.data();
        const [uid1, uid2] = [data.fromUid, data.toUid].sort();
        if (bbPairs.has(`${uid1}_${uid2}`)) {
          orphanBB.push({
            docId: doc.id,
            collection: 'burnBuddyRequests',
            details: `Pending request between ${data.fromUid} and ${data.toUid} — burnBuddy already exists`,
          });
        }
      }

      // (b) Orphan pending friendRequests where friend already exists
      for (const doc of friendRequestsSnap.docs) {
        const data = doc.data();
        const [uid1, uid2] = [data.fromUid, data.toUid].sort();
        if (friendPairs.has(`${uid1}_${uid2}`)) {
          orphanFriend.push({
            docId: doc.id,
            collection: 'friendRequests',
            details: `Pending request between ${data.fromUid} and ${data.toUid} — friend already exists`,
          });
        }
      }

      // (c) BurnBuddies without corresponding friend document
      for (const doc of bbSnap.docs) {
        const data = doc.data();
        const [uid1, uid2] = [data.uid1, data.uid2].sort();
        if (!friendPairs.has(`${uid1}_${uid2}`)) {
          bbNoFriend.push({
            docId: doc.id,
            collection: 'burnBuddies',
            details: `BurnBuddy between ${data.uid1} and ${data.uid2} has no corresponding friend document`,
          });
        }
      }

      // (d) Pending requests where one or both UIDs lack a user profile
      for (const doc of bbRequestsSnap.docs) {
        const data = doc.data();
        if (!userIds.has(data.fromUid) || !userIds.has(data.toUid)) {
          const missing: string[] = [];
          if (!userIds.has(data.fromUid)) missing.push(data.fromUid);
          if (!userIds.has(data.toUid)) missing.push(data.toUid);
          invalidUid.push({
            docId: doc.id,
            collection: 'burnBuddyRequests',
            details: `References non-existent user(s): ${missing.join(', ')}`,
          });
        }
      }

      for (const doc of friendRequestsSnap.docs) {
        const data = doc.data();
        if (!userIds.has(data.fromUid) || !userIds.has(data.toUid)) {
          const missing: string[] = [];
          if (!userIds.has(data.fromUid)) missing.push(data.fromUid);
          if (!userIds.has(data.toUid)) missing.push(data.toUid);
          invalidUid.push({
            docId: doc.id,
            collection: 'friendRequests',
            details: `References non-existent user(s): ${missing.join(', ')}`,
          });
        }
      }

      const report: RelationshipReport = {
        orphanPendingBBRequests: {
          count: orphanBB.length,
          ids: orphanBB.slice(0, MAX_IDS_PER_CATEGORY).map((i) => i.docId),
        },
        orphanPendingFriendRequests: {
          count: orphanFriend.length,
          ids: orphanFriend.slice(0, MAX_IDS_PER_CATEGORY).map((i) => i.docId),
        },
        bbWithoutFriendship: {
          count: bbNoFriend.length,
          ids: bbNoFriend.slice(0, MAX_IDS_PER_CATEGORY).map((i) => i.docId),
        },
        invalidUidRequests: {
          count: invalidUid.length,
          ids: invalidUid.slice(0, MAX_IDS_PER_CATEGORY).map((i) => i.docId),
        },
        totalScanned:
          bbRequestsSnap.size + friendRequestsSnap.size + bbSnap.size,
      };

      res.json(report);
    } catch (err) {
      logger.error({ err }, 'Diagnostics: failed to scan relationships');
      res.status(500).json({ error: 'Failed to scan relationship integrity' });
    }
  },
);

export default router;
