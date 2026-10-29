import { getNodeAutoInstrumentations, InstrumentationConfigMap } from '@opentelemetry/auto-instrumentations-node';
import { ExpressLayerType } from '@opentelemetry/instrumentation-express';
import { createInstrumentations } from './instrumentations';

jest.mock('@opentelemetry/auto-instrumentations-node', () => ({ getNodeAutoInstrumentations: jest.fn(() => []) }));

const configFor = (env: NodeJS.ProcessEnv): InstrumentationConfigMap => {
  jest.mocked(getNodeAutoInstrumentations).mockClear();
  createInstrumentations(env);
  return jest.mocked(getNodeAutoInstrumentations).mock.calls[0][0];
};

describe('createInstrumentations', () => {
  it('uses the official list, with dns, net, mongoose and winston off and process metrics on', () => {
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

  it('leaves every choice to OTEL_NODE_ENABLED_INSTRUMENTATIONS when it is set', () => {
    const config = configFor({ OTEL_NODE_ENABLED_INSTRUMENTATIONS: 'http,winston' });
    expect(config['@opentelemetry/instrumentation-winston']).toBeUndefined();
    expect(config['@opentelemetry/instrumentation-host-metrics'].enabled).toBeUndefined();
  });

  it('lets OTEL_NODE_DISABLED_INSTRUMENTATIONS turn process metrics off', () => {
    const config = configFor({ OTEL_NODE_DISABLED_INSTRUMENTATIONS: 'fs, host-metrics' });
    expect(config['@opentelemetry/instrumentation-host-metrics'].enabled).toBeUndefined();
  });

  it('passes the tracing options of each instrumentation', () => {
    const config = configFor({ TRACING_IGNORE_PATHS: '/ping' });
    const http = config['@opentelemetry/instrumentation-http'];
    expect(http.ignoreIncomingRequestHook({ url: '/concierge/health' } as never)).toBe(true);
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
