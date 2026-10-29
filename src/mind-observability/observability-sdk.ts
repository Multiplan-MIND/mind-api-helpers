import { register } from 'node:module';
import { pathToFileURL } from 'node:url';
import { metrics, trace } from '@opentelemetry/api';
import { NodeSDK } from '@opentelemetry/sdk-node';
import { GEN_AI_SCHEMA_URL, registerAiSdkIntegration } from './ai-sdk-telemetry';
import { warnAboutNewerApiCopies } from './api-copies';
import { registerExportErrorLogger } from './export-error-logger';
import { createInstrumentations } from './instrumentations';
import { createAiSdkMetrics } from './metrics/ai-sdk-metrics';
import { createDefaultResource, createResourceDetectors } from './observability-resource';
import { registerShutdown } from './observability-shutdown';
import { createAiSdkTracing } from './tracing/ai-sdk-tracing';

const SCOPE_NAME = 'mind-observability';

export interface ObservabilitySdkOptions {
  /** Registers the ESM loader hook, so modules loaded with `import` are instrumented too. */
  esm?: boolean;
}

/**
 * Builds and starts the OpenTelemetry SDK. Only `start-observability.ts` loads this file, after the switch checks, so
 * a service with telemetry off never loads the SDK. Exporters, protocol, sampler and propagators come from the
 * standard `OTEL_*` variables, read by NodeSDK itself (traces and metrics default to OTLP over http/protobuf).
 */
export function startObservabilitySdk(env: NodeJS.ProcessEnv, options: ObservabilitySdkOptions = {}): NodeSDK {
  if (options.esm) {
    register('@opentelemetry/instrumentation/hook.mjs', pathToFileURL(__filename));
  }
  registerExportErrorLogger(env);
  const sdk = new NodeSDK({
    resource: createDefaultResource(),
    resourceDetectors: createResourceDetectors(env),
    instrumentations: createInstrumentations(env),
    // NodeSDK would default the logs exporter to OTLP; the log line already goes to stdout, and the collector takes no
    // logs. An explicit OTEL_LOGS_EXPORTER still wins.
    ...(env.OTEL_LOGS_EXPORTER ? {} : { logRecordProcessors: [] }),
  });
  sdk.start();
  const tracerProvider = trace.getTracerProvider();
  registerAiSdkIntegration(
    createAiSdkTracing(tracerProvider.getTracer(SCOPE_NAME, undefined, { schemaUrl: GEN_AI_SCHEMA_URL })),
  );
  registerAiSdkIntegration(
    createAiSdkMetrics(metrics.getMeter(SCOPE_NAME, undefined, { schemaUrl: GEN_AI_SCHEMA_URL })),
  );
  registerShutdown(sdk);
  warnAboutNewerApiCopies();
  return sdk;
}
