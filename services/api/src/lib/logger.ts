import pino from 'pino';

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

export const logger = pino({ level: process.env.LOG_LEVEL ?? 'info' }, transport);
