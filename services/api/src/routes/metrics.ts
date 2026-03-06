import { Router, type Request, type Response } from 'express';
import { logger } from '../lib/logger';

const router = Router();

const VALID_METRIC_NAMES = ['LCP', 'FCP', 'TTFB', 'CLS', 'INP'] as const;
type MetricName = (typeof VALID_METRIC_NAMES)[number];

interface VitalsPayload {
  name: MetricName;
  value: number;
  id?: string;
  delta?: number;
  navigationType?: string;
  rating?: string;
  metadata?: Record<string, unknown>;
}

/**
 * POST /metrics/vitals
 * Receives Core Web Vitals metrics from the browser client.
 * No auth required — metrics are anonymous.
 */
router.post('/vitals', (req: Request, res: Response): void => {
  const { name, value, id, delta, navigationType, rating, metadata } = req.body as VitalsPayload;

  if (!name || typeof name !== 'string') {
    res.status(400).json({ error: 'name is required and must be a string' });
    return;
  }

  if (!VALID_METRIC_NAMES.includes(name as MetricName)) {
    res.status(400).json({
      error: `Invalid metric name. Must be one of: ${VALID_METRIC_NAMES.join(', ')}`,
    });
    return;
  }

  if (value === undefined || value === null || typeof value !== 'number') {
    res.status(400).json({ error: 'value is required and must be a number' });
    return;
  }

  logger.info(
    { metric: name, value, id, delta, navigationType, rating, metadata },
    `Web vital: ${name}`,
  );

  res.status(204).end();
});

export default router;
