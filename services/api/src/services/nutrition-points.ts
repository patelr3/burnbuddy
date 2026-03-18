import { FieldValue } from 'firebase-admin/firestore';
import { getDb } from '../lib/firestore';
import { logger } from '../lib/logger';
import { SUPPORTED_NUTRIENTS } from '@burnbuddy/shared';
import type { NutrientId, NutrientAmount, NutritionGoals, MealEntry, SupplementEntry } from '@burnbuddy/shared';

/**
 * Extracts YYYY-MM from a YYYY-MM-DD date string.
 */
function dateToMonth(date: string): string {
  return date.slice(0, 7);
}

/**
 * Evaluates nutrition points for a user on a given date.
 *
 * For each target nutrient in the user's goals:
 *   - If consumed >= 100% of dailyRecommended and no point was awarded yet → award 1 point
 *   - If consumed < 100% and a point was previously awarded → revoke 1 point
 *
 * Points are tracked in `nutritionPointsAwarded` (doc ID: uid_date_nutrientId)
 * and aggregated in `monthlyPoints` (doc ID: uid_month) using FieldValue.increment.
 *
 * Errors are logged but never thrown (fire-and-forget usage).
 */
export async function evaluateNutritionPoints(uid: string, date: string): Promise<void> {
  const db = getDb();

  // 1. Fetch user's nutrition goals
  const goalsDoc = await db.collection('nutritionGoals').doc(uid).get();
  if (!goalsDoc.exists) {
    logger.debug({ uid, date }, 'No nutrition goals set — skipping points evaluation');
    return;
  }

  const goals = goalsDoc.data() as NutritionGoals;
  const targets = goals.targetNutrients;
  if (!targets || targets.length === 0) {
    logger.debug({ uid, date }, 'No target nutrients — skipping points evaluation');
    return;
  }

  // 2. Fetch all meals for user on this date
  const mealsSnapshot = await db
    .collection('mealEntries')
    .where('uid', '==', uid)
    .where('date', '==', date)
    .get();

  const meals = mealsSnapshot.docs.map((doc) => doc.data() as MealEntry);

  // 2b. Fetch all supplement entries for user on this date
  const supplementsSnapshot = await db
    .collection('supplementEntries')
    .where('uid', '==', uid)
    .where('date', '==', date)
    .get();

  const supplements = supplementsSnapshot.docs.map((doc) => doc.data() as SupplementEntry);

  // 3. Sum consumed nutrients across all meals and supplements
  const consumedMap = new Map<NutrientId, number>();
  for (const meal of meals) {
    if (!meal.nutrients) continue;
    for (const n of meal.nutrients) {
      consumedMap.set(n.nutrientId, (consumedMap.get(n.nutrientId) ?? 0) + n.amount);
    }
  }
  for (const supp of supplements) {
    if (!supp.nutrients) continue;
    for (const n of supp.nutrients) {
      consumedMap.set(n.nutrientId, (consumedMap.get(n.nutrientId) ?? 0) + n.amount);
    }
  }

  // 4. Build lookup for daily recommended values
  const recommendedMap = new Map<NutrientId, number>();
  for (const info of SUPPORTED_NUTRIENTS) {
    recommendedMap.set(info.id, info.dailyRecommended);
  }

  const month = dateToMonth(date);
  const monthlyDocId = `${uid}_${month}`;
  const now = new Date().toISOString();

  // 5. Evaluate each target nutrient
  for (const nutrientId of targets) {
    const consumed = consumedMap.get(nutrientId) ?? 0;
    const recommended = recommendedMap.get(nutrientId);
    if (recommended === undefined) continue;

    const percentComplete = (consumed / recommended) * 100;
    const awardDocId = `${uid}_${date}_${nutrientId}`;

    try {
      const awardDoc = await db.collection('nutritionPointsAwarded').doc(awardDocId).get();
      const alreadyAwarded = awardDoc.exists;

      if (percentComplete >= 100 && !alreadyAwarded) {
        // Award point
        await db.collection('nutritionPointsAwarded').doc(awardDocId).set({
          uid,
          date,
          nutrientId,
          awardedAt: now,
        });
        await db.collection('monthlyPoints').doc(monthlyDocId).set(
          {
            uid,
            month,
            points: FieldValue.increment(1),
            updatedAt: now,
          },
          { merge: true },
        );
        logger.info({ uid, date, nutrientId }, 'Nutrition point awarded');
      } else if (percentComplete < 100 && alreadyAwarded) {
        // Revoke point
        await db.collection('nutritionPointsAwarded').doc(awardDocId).delete();
        await db.collection('monthlyPoints').doc(monthlyDocId).set(
          {
            uid,
            month,
            points: FieldValue.increment(-1),
            updatedAt: now,
          },
          { merge: true },
        );
        logger.info({ uid, date, nutrientId }, 'Nutrition point revoked');
      }
    } catch (err) {
      logger.error({ err, uid, date, nutrientId }, 'Failed to evaluate nutrition point');
    }
  }
}
