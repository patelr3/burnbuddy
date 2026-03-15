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
 * Awards 1 point to each member for the current month.
 * Uses FieldValue.increment(1) for atomic updates and set-with-merge
 * to create the document if it doesn't exist.
 *
 * Runs as a background side-effect — errors are logged but never thrown.
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
    }),
  );
}
