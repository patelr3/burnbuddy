import './instrumentation'; // must be first — initializes OpenTelemetry SDK

import express from 'express';
import pino from 'pino';
import { initFirebase } from './lib/firebase';
import { requireAuth } from './middleware/auth';

// Initialize Firebase Admin on startup
initFirebase();

const transportTargets: pino.TransportTargetOptions[] = [
  {
    target: 'pino/file',
    options: { destination: 1 }, // stdout
    level: process.env.LOG_LEVEL ?? 'info',
  },
];

// Enable OpenTelemetry log transport when OTEL_LOGS_ENABLED=true (e.g., production with collector)
if (process.env.OTEL_LOGS_ENABLED === 'true') {
  transportTargets.push({
    target: 'pino-opentelemetry-transport',
    options: {},
    level: process.env.LOG_LEVEL ?? 'info',
  });
}

const transport = pino.transport({ targets: transportTargets });

const logger = pino({ level: process.env.LOG_LEVEL ?? 'info' }, transport);

const app = express();
const PORT = process.env.PORT ?? 3001;

app.use(express.json());

app.get('/health', (_req, res) => {
  res.json({ status: 'ok' });
});

// Protected route example — returns the authenticated user's uid
app.get('/me', requireAuth, (req, res) => {
  res.json({ uid: req.user?.uid });
});

app.listen(PORT, () => {
  logger.info({ port: PORT }, 'BurnBuddy API service started');
});

export { app, logger };
