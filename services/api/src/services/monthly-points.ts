import { FieldValue } from 'firebase-admin/firestore';
import { getDb } from '../lib/firestore';
import { logger } from '../lib/logger';

/**
 * Returns the current month in YYYY-MM format.
 */
export function getCurrentMonth(): string {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  return `${year}-${month}`;
}

/**
 * Returns the month string (YYYY-MM) that is exactly 12 months before the given date.
 */
export function getCutoffMonth(now: Date = new Date()): string {
  const cutoff = new Date(now.getFullYear(), now.getMonth() - 12, 1);
  return `${cutoff.getFullYear()}-${String(cutoff.getMonth() + 1).padStart(2, '0')}`;
}

/**
 * Deletes monthlyPoints documents older than 12 months for a given user.
 * Runs as a background side-effect — errors are logged but never thrown.
 */
export async function pruneOldMonthlyPoints(uid: string): Promise<void> {
  const db = getDb();
  const cutoff = getCutoffMonth();

  try {
    const snap = await db.collection('monthlyPoints').where('uid', '==', uid).get();
    const toDelete = snap.docs.filter((d) => {
      const month = (d.data() as { month: string }).month;
      return month < cutoff;
    });

    if (toDelete.length === 0) return;

    await Promise.all(
      toDelete.map((d) => db.collection('monthlyPoints').doc(d.id).delete()),
    );
  } catch (err) {
    logger.error({ err, uid }, 'Failed to prune old monthly points');
  }
}

/**
 * Awards 1 point to each member for the current month.
 * Uses FieldValue.increment(1) for atomic updates and set-with-merge
 * to create the document if it doesn't exist.
 *
 * After awarding points, prunes any documents older than 12 months
 * for each member (fire-and-forget).
 */
export async function awardGroupWorkoutPoints(memberUids: string[]): Promise<void> {
  const db = getDb();
  const month = getCurrentMonth();
  const now = new Date().toISOString();

  await Promise.all(
    memberUids.map(async (uid) => {
      const docId = `${uid}_${month}`;
      try {
        await db.collection('monthlyPoints').doc(docId).set(
          {
            uid,
            month,
            points: FieldValue.increment(1),
            updatedAt: now,
          },
          { merge: true },
        );
      } catch (err) {
        logger.error({ err, uid, month }, 'Failed to award monthly point');
      }

      // Prune old documents — fire-and-forget
      pruneOldMonthlyPoints(uid).catch((err: unknown) => {
        logger.error({ err, uid }, 'Monthly points pruning failed');
      });
    }),
  );
}
