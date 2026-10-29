import type { Instrumentation } from '@opentelemetry/instrumentation';
import { getNodeAutoInstrumentations, InstrumentationConfigMap } from '@opentelemetry/auto-instrumentations-node';
import { metricsInstrumentationConfig } from './metrics/metrics-instrumentations';
import { tracingInstrumentationConfig } from './tracing/tracing-instrumentations';

/**
 * Desligadas por padrão, além da `fs`, que o pacote oficial já desliga: `dns` e `net` criam um span por conexão,
 * `mongoose` repete como span de modelo cada comando que a `mongodb` já registra, e `winston` mudaria as linhas do
 * MindLogger, que já carregam o trace id.
 */
const OFF_BY_DEFAULT = [
  '@opentelemetry/instrumentation-dns',
  '@opentelemetry/instrumentation-net',
  '@opentelemetry/instrumentation-mongoose',
  '@opentelemetry/instrumentation-winston',
];

const HOST_METRICS = 'host-metrics';

/**
 * Todas as instrumentações do pacote oficial, cada uma inerte até a aplicação carregar o módulo dela. A escolha segue
 * as variáveis padrão: `OTEL_NODE_DISABLED_INSTRUMENTATIONS` tira nomes da lista, e
 * `OTEL_NODE_ENABLED_INSTRUMENTATIONS` substitui a lista inteira, inclusive os padrões escolhidos aqui.
 */
export function createInstrumentations(env: NodeJS.ProcessEnv): Instrumentation[] {
  const metrics = metricsInstrumentationConfig();
  /** As chaves dos três mapas são distintas; a de host-metrics é combinada à parte. */
  return getNodeAutoInstrumentations({
    ...offByDefault(env),
    ...tracingInstrumentationConfig(env),
    ...metrics,
    '@opentelemetry/instrumentation-host-metrics': {
      ...metrics['@opentelemetry/instrumentation-host-metrics'],
      enabled: onByDefault(env, HOST_METRICS),
    },
  });
}

/** `enabled: false` vence as variáveis, então só vale enquanto a lista de instrumentações ligadas for implícita. */
function offByDefault(env: NodeJS.ProcessEnv): InstrumentationConfigMap {
  if (env.OTEL_NODE_ENABLED_INSTRUMENTATIONS) {
    return {};
  }
  return Object.fromEntries(OFF_BY_DEFAULT.map((name) => [name, { enabled: false }]));
}

/** Liga uma instrumentação que o pacote oficial deixa desligada, salvo se as variáveis disserem algo sobre ela. */
function onByDefault(env: NodeJS.ProcessEnv, name: string): boolean | undefined {
  if (env.OTEL_NODE_ENABLED_INSTRUMENTATIONS) {
    return undefined;
  }
  const disabled = (env.OTEL_NODE_DISABLED_INSTRUMENTATIONS ?? '').split(',').map((entry) => entry.trim());
  return disabled.includes(name) ? undefined : true;
}
