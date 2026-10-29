import { metrics, trace } from '@opentelemetry/api';
import { NodeSDK } from '@opentelemetry/sdk-node';
import { GEN_AI_SCHEMA_URL, registerAiSdkIntegration } from './ai-sdk-telemetry';
import { warnAboutNewerApiCopies } from './api-copies';
import { registerEsmLoaderHook } from './esm-loader-hook';
import { registerExportErrorLogger } from './export-error-logger';
import { createInstrumentations } from './instrumentations';
import { createAiSdkMetrics } from './metrics/ai-sdk-metrics';
import { createDefaultResource, createResourceDetectors } from './observability-resource';
import { registerShutdown } from './observability-shutdown';
import { createAiSdkTracing } from './tracing/ai-sdk-tracing';

const SCOPE_NAME = 'mind-observability';

/**
 * Só o `start-observability.ts` carrega este arquivo, depois de checar o switch, para um serviço com a telemetria
 * desligada nunca carregar o SDK. Exporters, protocolo, sampler e propagators vêm das variáveis `OTEL_*` padrão, lidas
 * pelo próprio NodeSDK.
 */
export function startObservabilitySdk(env: NodeJS.ProcessEnv): NodeSDK {
  registerEsmLoaderHook();
  registerExportErrorLogger(env);
  const sdk = new NodeSDK({
    resource: createDefaultResource(),
    resourceDetectors: createResourceDetectors(env),
    instrumentations: createInstrumentations(env),
    /**
     * O NodeSDK mandaria os logs por OTLP por padrão, mas a linha de log do serviço já sai pelo stdout. Um
     * OTEL_LOGS_EXPORTER explícito é respeitado.
     */
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
