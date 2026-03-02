import express from 'express';
import pino from 'pino';

const logger = pino({
  level: process.env.LOG_LEVEL ?? 'info',
});

const app = express();
const PORT = process.env.PORT ?? 3001;

app.use(express.json());

app.get('/health', (_req, res) => {
  res.json({ status: 'ok' });
});

app.listen(PORT, () => {
  logger.info({ port: PORT }, 'BurnBuddy API service started');
});

export { app, logger };
