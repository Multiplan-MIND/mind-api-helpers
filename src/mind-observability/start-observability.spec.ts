import { diag } from '@opentelemetry/api';
import { NodeSDK } from '@opentelemetry/sdk-node';
import { HttpInstrumentation } from '@opentelemetry/instrumentation-http';
import { startObservability } from './start-observability';

const mockSdkFactory = jest.fn();

jest.mock('@opentelemetry/sdk-node', () => ({
  NodeSDK: jest.fn().mockImplementation(() => {
    mockSdkFactory();
    return { start: jest.fn(), shutdown: jest.fn().mockResolvedValue(undefined) };
  }),
}));
jest.mock('@opentelemetry/exporter-trace-otlp-http', () => ({ OTLPTraceExporter: jest.fn() }));
jest.mock('@opentelemetry/instrumentation-http', () => ({ HttpInstrumentation: jest.fn() }));
jest.mock('@opentelemetry/instrumentation-express', () => ({ ExpressInstrumentation: jest.fn() }));
jest.mock('@opentelemetry/instrumentation-nestjs-core', () => ({ NestInstrumentation: jest.fn() }));
jest.mock('@opentelemetry/instrumentation-mongodb', () => ({ MongoDBInstrumentation: jest.fn() }));
jest.mock('@opentelemetry/instrumentation-ioredis', () => ({ IORedisInstrumentation: jest.fn() }));
jest.mock('@opentelemetry/instrumentation-amqplib', () => ({ AmqplibInstrumentation: jest.fn() }));
jest.mock('@opentelemetry/instrumentation-undici', () => ({ UndiciInstrumentation: jest.fn() }));
jest.mock('@opentelemetry/instrumentation-graphql', () => ({ GraphQLInstrumentation: jest.fn() }));
jest.mock('@opentelemetry/instrumentation-runtime-node', () => ({ RuntimeNodeInstrumentation: jest.fn() }));

const enabled = { OTEL_EXPORTER_OTLP_ENDPOINT: 'http://tempo:4318' };
const flushPromises = () => new Promise<void>((resolve) => jest.requireActual('timers').setImmediate(resolve));

describe('startObservability', () => {
  let kill: jest.SpyInstance;

  beforeEach(() => {
    jest.clearAllMocks();
    kill = jest.spyOn(process, 'kill').mockImplementation(() => true);
  });

  afterEach(() => {
    delete (globalThis as { AI_SDK_TELEMETRY_INTEGRATIONS?: unknown[] }).AI_SDK_TELEMETRY_INTEGRATIONS;
    diag.disable();
    process.removeAllListeners('SIGTERM');
    kill.mockRestore();
    jest.useRealTimers();
  });

  it('does nothing and never loads the SDK without the endpoint', () => {
    expect(startObservability({})).toBeUndefined();
    expect(mockSdkFactory).not.toHaveBeenCalled();
    expect(NodeSDK).not.toHaveBeenCalled();
  });

  it('does nothing when OTEL_SDK_DISABLED is "true"', () => {
    expect(startObservability({ ...enabled, OTEL_SDK_DISABLED: 'true' })).toBeUndefined();
    expect(NodeSDK).not.toHaveBeenCalled();
  });

  it('starts the SDK once with the nine instrumentations', () => {
    const sdk = startObservability({ ...enabled });
    expect(NodeSDK).toHaveBeenCalledTimes(1);
    expect((NodeSDK as unknown as jest.Mock).mock.calls[0][0].instrumentations).toHaveLength(9);
    expect(sdk.start).toHaveBeenCalledTimes(1);
  });

  it('registers the AI SDK tracing and metrics integrations when the SDK starts', () => {
    startObservability({ ...enabled });
    const integrations = (globalThis as { AI_SDK_TELEMETRY_INTEGRATIONS?: unknown[] }).AI_SDK_TELEMETRY_INTEGRATIONS;
    expect(integrations).toHaveLength(2);
  });

  it('does not register the AI SDK integration without the endpoint', () => {
    startObservability({});
    expect((globalThis as { AI_SDK_TELEMETRY_INTEGRATIONS?: unknown[] }).AI_SDK_TELEMETRY_INTEGRATIONS).toBeUndefined();
  });

  it('wires the ignore hook into the HTTP instrumentation, with TRACING_IGNORE_PATHS added', () => {
    startObservability({ ...enabled, TRACING_IGNORE_PATHS: '/ping' });
    const { ignoreIncomingRequestHook } = (HttpInstrumentation as unknown as jest.Mock).mock.calls[0][0];
    expect(ignoreIncomingRequestHook({ url: '/concierge/health' })).toBe(true);
    expect(ignoreIncomingRequestHook({ url: '/ping' })).toBe(true);
    expect(ignoreIncomingRequestHook({ url: '/health/trace' })).toBe(false);
  });

  it('defaults the metrics exporter to otlp and the logs exporter to none', () => {
    const env: NodeJS.ProcessEnv = { ...enabled };
    startObservability(env);
    expect(env.OTEL_METRICS_EXPORTER).toBe('otlp');
    expect(env.OTEL_LOGS_EXPORTER).toBe('none');
  });

  it('keeps explicit exporter values', () => {
    const env: NodeJS.ProcessEnv = { ...enabled, OTEL_METRICS_EXPORTER: 'none', OTEL_LOGS_EXPORTER: 'otlp' };
    startObservability(env);
    expect(env.OTEL_METRICS_EXPORTER).toBe('none');
    expect(env.OTEL_LOGS_EXPORTER).toBe('otlp');
  });

  it('swallows an SDK failure: one line on stderr and the app keeps running', () => {
    (NodeSDK as unknown as jest.Mock).mockImplementationOnce(() => {
      throw new Error('boom');
    });
    const write = jest.spyOn(process.stderr, 'write').mockImplementation(() => true);
    expect(startObservability({ ...enabled })).toBeUndefined();
    expect(write).toHaveBeenCalledTimes(1);
    write.mockRestore();
  });

  describe('export error logging', () => {
    let write: jest.SpyInstance;

    beforeEach(() => {
      write = jest.spyOn(process.stderr, 'write').mockImplementation(() => true);
    });

    afterEach(() => {
      write.mockRestore();
    });

    it('writes exactly one stderr line for the first OpenTelemetry error and ignores later ones', () => {
      startObservability({ ...enabled });
      diag.error('boom');
      diag.error('second');
      expect(write).toHaveBeenCalledTimes(1);
      expect(write.mock.calls[0][0]).toContain('boom');
      expect(write.mock.calls[0][0]).not.toContain('second');
    });

    it('ignores levels other than error', () => {
      startObservability({ ...enabled });
      diag.warn('careful');
      diag.info('fyi');
      expect(write).not.toHaveBeenCalled();
    });

    it('does not install the logger when telemetry is disabled', () => {
      startObservability({ ...enabled, OTEL_SDK_DISABLED: 'true' });
      diag.error('boom');
      expect(write).not.toHaveBeenCalled();
    });

    it('does not install the logger when OTEL_LOG_LEVEL is set', () => {
      startObservability({ ...enabled, OTEL_LOG_LEVEL: 'info' });
      diag.error('boom');
      expect(write).not.toHaveBeenCalled();
    });
  });

  it('flushes on SIGTERM and re-raises it when the app has no handler of its own', async () => {
    const sdk = startObservability({ ...enabled });
    (sdk.shutdown as jest.Mock).mockResolvedValue(undefined);
    process.emit('SIGTERM');
    await flushPromises();
    expect(sdk.shutdown).toHaveBeenCalledTimes(1);
    expect(kill).toHaveBeenCalledWith(process.pid, 'SIGTERM');
  });

  it('does not re-raise SIGTERM when the app registered its own handler', async () => {
    const sdk = startObservability({ ...enabled });
    (sdk.shutdown as jest.Mock).mockResolvedValue(undefined);
    process.on('SIGTERM', jest.fn());
    process.emit('SIGTERM');
    await flushPromises();
    expect(sdk.shutdown).toHaveBeenCalledTimes(1);
    expect(kill).not.toHaveBeenCalled();
  });

  it('stops waiting for a stuck shutdown after 5 s', async () => {
    jest.useFakeTimers();
    const sdk = startObservability({ ...enabled });
    (sdk.shutdown as jest.Mock).mockReturnValue(new Promise(() => undefined));
    process.emit('SIGTERM');
    expect(kill).not.toHaveBeenCalled();
    await jest.advanceTimersByTimeAsync(5000);
    expect(kill).toHaveBeenCalledWith(process.pid, 'SIGTERM');
  });
});
