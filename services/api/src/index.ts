import './instrumentation'; // must be first — initializes OpenTelemetry SDK

import 'express-async-errors'; // patches Express to forward async errors to error handler
import express from 'express';
import pino from 'pino';
import { initFirebase } from './lib/firebase';
import { requireAuth } from './middleware/auth';
import usersRouter from './routes/users';
import friendsRouter from './routes/friends';
import burnBuddiesRouter from './routes/burn-buddies';
import burnSquadsRouter from './routes/burn-squads';
import workoutsRouter, { autoEndStaleWorkouts } from './routes/workouts';
import groupWorkoutsRouter from './routes/group-workouts';

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

app.use('/users', usersRouter);
app.use('/friends', friendsRouter);
app.use('/burn-buddies', burnBuddiesRouter);
app.use('/burn-squads', burnSquadsRouter);
app.use('/workouts', workoutsRouter);
app.use('/group-workouts', groupWorkoutsRouter);

app.get('/health', (_req, res) => {
  res.json({ status: 'ok' });
});

// Protected route example — returns the authenticated user's uid
app.get('/me', requireAuth, (req, res) => {
  res.json({ uid: req.user?.uid });
});

// Global error handler — catches async errors forwarded by express-async-errors
app.use(
  (
    err: Error,
    _req: express.Request,
    res: express.Response,
    _next: express.NextFunction,
  ) => {
    logger.error({ err }, 'Unhandled route error');
    if (!res.headersSent) {
      res.status(500).json({ error: 'Internal server error' });
    }
  },
);

app.listen(PORT, () => {
  logger.info({ port: PORT }, 'BurnBuddy API service started');
});

// Auto-end workouts that have been active for more than 1.5 hours.
// Runs every 10 minutes; in production this can also be triggered by a Cloud Function.
const AUTO_END_INTERVAL_MS = 10 * 60 * 1000;
setInterval(() => {
  autoEndStaleWorkouts()
    .then((count) => {
      if (count > 0) logger.info({ count }, 'Auto-ended stale workouts');
    })
    .catch((err: unknown) => logger.error({ err }, 'Error auto-ending stale workouts'));
}, AUTO_END_INTERVAL_MS);

export { app, logger };
