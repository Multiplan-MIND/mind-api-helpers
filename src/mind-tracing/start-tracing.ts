import { diag, DiagLogLevel, metrics, trace } from '@opentelemetry/api';
import type { NodeSDK } from '@opentelemetry/sdk-node';
import { registerAiSdkTelemetry } from './ai-sdk-telemetry';
import { ignoreIncomingRequest, parseIgnorePaths } from './ignore-paths';

const SHUTDOWN_TIMEOUT_MS = 5000;

/**
 * Starts the OpenTelemetry SDK when OTEL_EXPORTER_OTLP_ENDPOINT is set and OTEL_SDK_DISABLED is not "true".
 * Otherwise it does nothing and loads nothing from the SDK. The SDK and the instrumentations are loaded with
 * `require` inside this function, after those checks, so a disabled service pays no cost for them.
 * An SDK failure is reported on stderr and never stops the application. So is the first export failure.
 *
 * The `env` parameter is meant for tests: the defaults set below only reach `NodeSDK` when `env` is `process.env`.
 */
export function startTracing(env: NodeJS.ProcessEnv = process.env): NodeSDK | undefined {
  if (env.OTEL_SDK_DISABLED === 'true' || !env.OTEL_EXPORTER_OTLP_ENDPOINT) {
    return undefined;
  }

  // Metrics go to the same collector as the traces. Logs stay off: the log line already goes to stdout and the file,
  // and NodeSDK's default logs exporter would spam connection errors against a collector that does not take logs.
  env.OTEL_METRICS_EXPORTER ??= 'otlp';
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
    const { UndiciInstrumentation } = require('@opentelemetry/instrumentation-undici');
    const { GraphQLInstrumentation } = require('@opentelemetry/instrumentation-graphql');
    const { RuntimeNodeInstrumentation } = require('@opentelemetry/instrumentation-runtime-node');
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
        // fetch, which the http instrumentation does not see.
        new UndiciInstrumentation(),
        // Resolver spans would multiply the spans of every query; the execute span already carries the operation.
        new GraphQLInstrumentation({ ignoreResolveSpans: true }),
        new RuntimeNodeInstrumentation(),
      ],
    });
    sdk.start();
    registerAiSdkTelemetry(trace.getTracer('mind-tracing'), metrics.getMeter('mind-tracing'));
    registerExportErrorLogger(env);
    registerShutdown(sdk);
    return sdk;
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    process.stderr.write(`[mind-tracing] failed to start OpenTelemetry, continuing without tracing: ${message}\n`);
    return undefined;
  }
}

/**
 * Export failures reach OpenTelemetry's diag error handler, and NodeSDK installs a diag logger only when
 * OTEL_LOG_LEVEL is set. Without one, a wrong endpoint or a collector outage would print nothing, so this installs
 * a logger that writes the first error to stderr and ignores the rest. When OTEL_LOG_LEVEL is set the user
 * controls diagnostics and nothing is installed.
 */
function registerExportErrorLogger(env: NodeJS.ProcessEnv): void {
  if (env.OTEL_LOG_LEVEL) {
    return;
  }
  let logged = false;
  const noop = () => undefined;
  diag.setLogger(
    {
      error: (message: string) => {
        if (logged) {
          return;
        }
        logged = true;
        process.stderr.write(`[mind-tracing] OpenTelemetry error (further errors are not logged): ${message}\n`);
      },
      warn: noop,
      info: noop,
      debug: noop,
      verbose: noop,
    },
    DiagLogLevel.ERROR,
  );
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
    // Neither branch of the race rejects, so there is nothing left to handle after the re-raise.
    void Promise.race([sdk.shutdown().catch(() => undefined), timeout]).then(() => {
      clearTimeout(timer);
      if (process.listenerCount('SIGTERM') === 0) {
        process.kill(process.pid, 'SIGTERM');
      }
    });
  });
}
