/**
 * Testes executados:
 * - usa a lista oficial, com dns, net, mongoose e winston desligadas e as métricas do processo ligadas
 * - deixa toda escolha para OTEL_NODE_ENABLED_INSTRUMENTATIONS quando ela está definida
 * - deixa OTEL_NODE_DISABLED_INSTRUMENTATIONS desligar as métricas do processo
 * - passa as opções de tracing de cada instrumentação
 */

import { getNodeAutoInstrumentations, InstrumentationConfigMap } from '@opentelemetry/auto-instrumentations-node';
import { ExpressLayerType } from '@opentelemetry/instrumentation-express';
import { createInstrumentations } from './instrumentations';

/** Configuração: o pacote oficial é substituído, para o teste ler a configuração que ele recebe. */
jest.mock('@opentelemetry/auto-instrumentations-node', () => ({ getNodeAutoInstrumentations: jest.fn(() => []) }));

/** Factories/helpers: configuração passada ao pacote oficial para um ambiente. */
const configFor = (env: NodeJS.ProcessEnv): InstrumentationConfigMap => {
  jest.mocked(getNodeAutoInstrumentations).mockClear();
  createInstrumentations(env);
  return jest.mocked(getNodeAutoInstrumentations).mock.calls[0][0];
};

/** Testes */
describe('createInstrumentations', () => {
  it('usa a lista oficial, com dns, net, mongoose e winston desligadas e as métricas do processo ligadas', () => {
    const config = configFor({});
    expect(config['@opentelemetry/instrumentation-dns']).toEqual({ enabled: false });
    expect(config['@opentelemetry/instrumentation-net']).toEqual({ enabled: false });
    expect(config['@opentelemetry/instrumentation-mongoose']).toEqual({ enabled: false });
    expect(config['@opentelemetry/instrumentation-winston']).toEqual({ enabled: false });
    expect(config['@opentelemetry/instrumentation-host-metrics']).toEqual({
      enabled: true,
      metricGroups: ['process.cpu', 'process.memory'],
    });
  });

  it('deixa toda escolha para OTEL_NODE_ENABLED_INSTRUMENTATIONS quando ela está definida', () => {
    const config = configFor({ OTEL_NODE_ENABLED_INSTRUMENTATIONS: 'http,winston' });
    expect(config['@opentelemetry/instrumentation-winston']).toBeUndefined();
    expect(config['@opentelemetry/instrumentation-host-metrics'].enabled).toBeUndefined();
  });

  it('deixa OTEL_NODE_DISABLED_INSTRUMENTATIONS desligar as métricas do processo', () => {
    const config = configFor({ OTEL_NODE_DISABLED_INSTRUMENTATIONS: 'fs, host-metrics' });
    expect(config['@opentelemetry/instrumentation-host-metrics'].enabled).toBeUndefined();
  });

  it('passa as opções de tracing de cada instrumentação', () => {
    const config = configFor({ TRACING_IGNORE_PATHS: '/ping' });
    const http = config['@opentelemetry/instrumentation-http'];
    expect(http.ignoreIncomingRequestHook({ url: '/exemplo/health' } as never)).toBe(true);
    expect(http.ignoreIncomingRequestHook({ url: '/ping' } as never)).toBe(true);
    expect(http.ignoreIncomingRequestHook({ url: '/health/trace' } as never)).toBe(false);
    expect(http.requestHook).toBeDefined();
    expect(config['@opentelemetry/instrumentation-undici'].requestHook).toBeDefined();
    expect(config['@opentelemetry/instrumentation-express'].ignoreLayersType).toEqual([ExpressLayerType.MIDDLEWARE]);
    expect(config['@opentelemetry/instrumentation-ioredis'].dbStatementSerializer('get', ['k:21987654321'])).toBe(
      'get k:<redacted>',
    );
    expect(config['@opentelemetry/instrumentation-redis'].dbStatementSerializer('get', ['k:21987654321'])).toBe(
      'get k:<redacted>',
    );
    expect(config['@opentelemetry/instrumentation-mongodb'].enhancedDatabaseReporting).toBe(false);
    expect(config['@opentelemetry/instrumentation-graphql'].ignoreResolveSpans).toBe(true);
  });
});
