import { admin } from './firebase';
import { logger } from './logger';

/**
 * Returns the Firebase Storage bucket using an explicit bucket name
 * from FIREBASE_STORAGE_BUCKET env var (falls back to {projectId}.appspot.com).
 */
export function getStorageBucket() {
  const projectId = process.env.FIREBASE_PROJECT_ID ?? 'burnbuddy-dev';
  const bucketName =
    process.env.FIREBASE_STORAGE_BUCKET ?? `${projectId}.appspot.com`;
  return admin.storage().bucket(bucketName);
}

/**
 * Lightweight connectivity check at startup.
 * Logs a warning if the bucket is unreachable — does NOT block startup.
 */
export async function checkStorageConnectivity(): Promise<void> {
  try {
    const bucket = getStorageBucket();
    const [exists] = await bucket.exists();
    if (!exists) {
      logger.warn(
        { bucket: bucket.name },
        'Firebase Storage bucket does not exist — uploads will fail',
      );
    } else {
      logger.info({ bucket: bucket.name }, 'Firebase Storage bucket verified');
    }
  } catch (err) {
    logger.warn(
      { err },
      'Firebase Storage connectivity check failed — storage features may not work',
    );
  }
}
