import { Router, type Request, type Response } from 'express';
import sharp from 'sharp';
import { requireAuth } from '../middleware/auth';
import { getStorageBucket } from '../lib/storage';
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
    const projectId = process.env.FIREBASE_PROJECT_ID ?? 'burnbuddy-dev';
    const bucketName =
      process.env.FIREBASE_STORAGE_BUCKET ?? `${projectId}.appspot.com`;

    const bucket = getStorageBucket();
    const [bucketExists] = await bucket.exists();

    result.storage = {
      bucketName,
      bucketExists,
      credentialsPresent: !!(
        process.env.FIREBASE_SERVICE_ACCOUNT_JSON &&
        process.env.FIREBASE_SERVICE_ACCOUNT_JSON.trim() !== ''
      ),
    };
  } catch (err) {
    logger.error({ err }, 'Diagnostics: failed to check storage');
    result.storage = { error: 'Failed to check bucket' };
  }

  res.json(result);
});

export default router;
