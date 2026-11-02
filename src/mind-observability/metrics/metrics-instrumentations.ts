import type { InstrumentationConfigMap } from '@opentelemetry/auto-instrumentations-node';

/**
 * Opções das instrumentações que só produzem métricas. A `runtime-node` (event loop, heap e GC) não precisa de nenhuma.
 * A `host-metrics` fica restrita ao processo: CPU e memória do nó inteiro são do cluster, não do serviço.
 */
export function metricsInstrumentationConfig(): InstrumentationConfigMap {
  return {
    '@opentelemetry/instrumentation-host-metrics': { metricGroups: ['process.cpu', 'process.memory'] },
  };
}
