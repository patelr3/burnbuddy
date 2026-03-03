import { NodeSDK } from '@opentelemetry/sdk-node';
import { ConsoleSpanExporter } from '@opentelemetry/sdk-trace-node';

const sdk = new NodeSDK({
  traceExporter: new ConsoleSpanExporter(),
});

sdk.start();

process.on('SIGTERM', () => {
  sdk.shutdown().catch(console.error);
});

export { sdk };
