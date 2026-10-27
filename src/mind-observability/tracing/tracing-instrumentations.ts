import type { NodeSDKConfiguration } from '@opentelemetry/sdk-node';
import { ignoreIncomingRequest, parseIgnorePaths } from './ignore-paths';

/**
 * Builds the instrumentations that produce spans. The packages are loaded with `require` inside the function, so
 * importing this file loads nothing from OpenTelemetry. The http and undici instrumentations also record the HTTP
 * duration histograms.
 */
export function createTracingInstrumentations(env: NodeJS.ProcessEnv): NodeSDKConfiguration['instrumentations'] {
  /* eslint-disable @typescript-eslint/no-var-requires */
  const { HttpInstrumentation } = require('@opentelemetry/instrumentation-http');
  const { ExpressInstrumentation } = require('@opentelemetry/instrumentation-express');
  const { NestInstrumentation } = require('@opentelemetry/instrumentation-nestjs-core');
  const { MongoDBInstrumentation } = require('@opentelemetry/instrumentation-mongodb');
  const { IORedisInstrumentation } = require('@opentelemetry/instrumentation-ioredis');
  const { AmqplibInstrumentation } = require('@opentelemetry/instrumentation-amqplib');
  const { UndiciInstrumentation } = require('@opentelemetry/instrumentation-undici');
  const { GraphQLInstrumentation } = require('@opentelemetry/instrumentation-graphql');
  /* eslint-enable @typescript-eslint/no-var-requires */

  return [
    new HttpInstrumentation({
      ignoreIncomingRequestHook: ignoreIncomingRequest(parseIgnorePaths(env.TRACING_IGNORE_PATHS)),
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
  ];
}
