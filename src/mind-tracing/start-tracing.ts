import type { NodeSDK } from '@opentelemetry/sdk-node';
import { ignoreIncomingRequest, parseIgnorePaths } from './ignore-paths';

const SHUTDOWN_TIMEOUT_MS = 5000;

/**
 * Starts the OpenTelemetry SDK when OTEL_EXPORTER_OTLP_ENDPOINT is set and OTEL_SDK_DISABLED is not "true".
 * Otherwise it does nothing and loads nothing from the SDK. The SDK and the instrumentations are loaded with
 * `require` inside this function, after those checks, so a disabled service pays no cost for them.
 * An SDK failure is reported on stderr and never stops the application.
 */
export function startTracing(env: NodeJS.ProcessEnv = process.env): NodeSDK | undefined {
  if (env.OTEL_SDK_DISABLED === 'true' || !env.OTEL_EXPORTER_OTLP_ENDPOINT) {
    return undefined;
  }

  // NodeSDK starts default metrics and logs OTLP exporters that spam connection errors when nothing listens.
  env.OTEL_METRICS_EXPORTER ??= 'none';
  env.OTEL_LOGS_EXPORTER ??= 'none';

  try {
    /* eslint-disable @typescript-eslint/no-var-requires */
    const { NodeSDK: Sdk } = require('@opentelemetry/sdk-node');
    const { OTLPTraceExporter } = require('@opentelemetry/exporter-trace-otlp-http');
    const { HttpInstrumentation } = require('@opentelemetry/instrumentation-http');
    const { ExpressInstrumentation } = require('@opentelemetry/instrumentation-express');
    const { NestInstrumentation } = require('@opentelemetry/instrumentation-nestjs-core');
    const { MongoDBInstrumentation } = require('@opentelemetry/instrumentation-mongodb');
    const { IORedisInstrumentation } = require('@opentelemetry/instrumentation-ioredis');
    const { AmqplibInstrumentation } = require('@opentelemetry/instrumentation-amqplib');
    /* eslint-enable @typescript-eslint/no-var-requires */

    const sdk: NodeSDK = new Sdk({
      traceExporter: new OTLPTraceExporter(),
      instrumentations: [
        new HttpInstrumentation({
          ignoreIncomingRequestHook: ignoreIncomingRequest(parseIgnorePaths(env.MIND_TRACING_IGNORE_PATHS)),
        }),
        new ExpressInstrumentation(),
        new NestInstrumentation(),
        new MongoDBInstrumentation(),
        new IORedisInstrumentation(),
        new AmqplibInstrumentation(),
      ],
    });
    sdk.start();
    registerShutdown(sdk);
    return sdk;
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    process.stderr.write(`[mind-tracing] failed to start OpenTelemetry, continuing without tracing: ${message}\n`);
    return undefined;
  }
}

/**
 * Flushes pending spans on SIGTERM (waiting at most 5 s). A SIGTERM listener disables Node's default
 * exit-on-SIGTERM, so the signal is re-raised afterwards, unless the application has its own handler.
 */
function registerShutdown(sdk: NodeSDK): void {
  process.once('SIGTERM', () => {
    let timer: NodeJS.Timeout;
    const timeout = new Promise<void>((resolve) => {
      timer = setTimeout(resolve, SHUTDOWN_TIMEOUT_MS);
      timer.unref();
    });
    Promise.race([sdk.shutdown().catch(() => undefined), timeout]).then(() => {
      clearTimeout(timer);
      if (process.listenerCount('SIGTERM') === 0) {
        process.kill(process.pid, 'SIGTERM');
      }
    });
  });
}
