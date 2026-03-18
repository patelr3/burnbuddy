import './instrumentation'; // must be first — initializes OpenTelemetry SDK

import 'express-async-errors'; // patches Express to forward async errors to error handler
import express from 'express';
import compression from 'compression';
import cors from 'cors';
import { initFirebase } from './lib/firebase';
import { checkStorageConnectivity } from './lib/storage';
import { logger } from './lib/logger';
import { requireAuth } from './middleware/auth';
import usersRouter from './routes/users';
import friendsRouter from './routes/friends';
import burnBuddiesRouter from './routes/burn-buddies';
import burnSquadsRouter from './routes/burn-squads';
import workoutsRouter, { autoEndStaleWorkouts } from './routes/workouts';
import groupWorkoutsRouter from './routes/group-workouts';
import dashboardRouter from './routes/dashboard';
import metricsRouter from './routes/metrics';
import diagnosticsRouter from './routes/diagnostics';
import nutritionRouter from './routes/nutrition';

// Initialize Firebase Admin on startup
initFirebase();

// Fire-and-forget storage connectivity check — logs warning if bucket is unreachable
checkStorageConnectivity().catch(() => {});

const app = express();
const PORT = process.env.PORT ?? 3001;

app.use(compression());
app.use(express.json());

// CORS — allow web origins to call the API from the browser
const corsOrigins = process.env.CORS_ORIGINS
  ? process.env.CORS_ORIGINS.split(',').map((o) => o.trim())
  : [
      'https://burnbuddy-beta.arayosun.com',
      'https://burnbuddy.arayosun.com',
      'http://localhost:3000',
    ];
app.use(cors({ origin: corsOrigins, credentials: true }));

app.use('/users', usersRouter);
app.use('/friends', friendsRouter);
app.use('/burn-buddies', burnBuddiesRouter);
app.use('/burn-squads', burnSquadsRouter);
app.use('/workouts', workoutsRouter);
app.use('/group-workouts', groupWorkoutsRouter);
app.use('/dashboard', dashboardRouter);
app.use('/metrics', metricsRouter);
app.use('/diagnostics', diagnosticsRouter);
app.use('/nutrition', nutritionRouter);

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
