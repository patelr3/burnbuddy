import { Router, type Request, type Response } from 'express';
import sharp from 'sharp';
import { requireAuth } from '../middleware/auth';
import { getContainerClient } from '../lib/storage';
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

export default router;
