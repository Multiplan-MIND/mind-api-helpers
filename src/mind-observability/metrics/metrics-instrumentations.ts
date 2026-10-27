import type { NodeSDKConfiguration } from '@opentelemetry/sdk-node';

/**
 * Builds the instrumentations that only produce metrics: event loop, heap and GC of the Node runtime. The package is
 * loaded with `require` inside the function, so importing this file loads nothing from OpenTelemetry.
 */
export function createMetricsInstrumentations(): NodeSDKConfiguration['instrumentations'] {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const { RuntimeNodeInstrumentation } = require('@opentelemetry/instrumentation-runtime-node');
  return [new RuntimeNodeInstrumentation()];
}
