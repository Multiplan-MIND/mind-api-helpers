import type { InstrumentationConfigMap } from '@opentelemetry/auto-instrumentations-node';
import { ExpressLayerType } from '@opentelemetry/instrumentation-express';
import { ignoreIncomingRequest, parseIgnorePaths } from './ignore-paths';
import { maskSpanAttributes, serializeRedisCommand } from './personal-data';

/**
 * Opções das instrumentações que produzem spans. Quais instrumentações ficam ligadas é decidido em
 * `../instrumentations.ts`; aqui ficam só as opções de cada uma.
 */
export function tracingInstrumentationConfig(env: NodeJS.ProcessEnv): InstrumentationConfigMap {
  return {
    '@opentelemetry/instrumentation-http': {
      ignoreIncomingRequestHook: ignoreIncomingRequest(parseIgnorePaths(env.TRACING_IGNORE_PATHS)),
      requestHook: maskSpanAttributes,
    },
    /** fetch, que a instrumentação http não enxerga. */
    '@opentelemetry/instrumentation-undici': { requestHook: maskSpanAttributes },
    /** Um span por middleware (jsonParser, urlencodedParser) só aumenta o volume; ficam o roteador e o handler. */
    '@opentelemetry/instrumentation-express': { ignoreLayersType: [ExpressLayerType.MIDDLEWARE] },
    /** Os dois clientes de Redis gravam a chave, que costuma carregar o telefone do cliente. */
    '@opentelemetry/instrumentation-ioredis': { dbStatementSerializer: serializeRedisCommand },
    '@opentelemetry/instrumentation-redis': { dbStatementSerializer: serializeRedisCommand },
    /** Explícito de propósito: o relatório estendido poria os valores das consultas no span. */
    '@opentelemetry/instrumentation-mongodb': { enhancedDatabaseReporting: false },
    /** Um span por resolver multiplicaria os spans de cada consulta; o span de execução já traz a operação. */
    '@opentelemetry/instrumentation-graphql': { ignoreResolveSpans: true },
  };
}
