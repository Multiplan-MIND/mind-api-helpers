import { NodeSDK } from '@opentelemetry/sdk-node';
import { HttpInstrumentation } from '@opentelemetry/instrumentation-http';
import { startTracing } from './start-tracing';

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

const enabled = { OTEL_EXPORTER_OTLP_ENDPOINT: 'http://tempo:4318' };
const flushPromises = () => new Promise<void>((resolve) => jest.requireActual('timers').setImmediate(resolve));

describe('startTracing', () => {
  let kill: jest.SpyInstance;

  beforeEach(() => {
    jest.clearAllMocks();
    kill = jest.spyOn(process, 'kill').mockImplementation(() => true);
  });

  afterEach(() => {
    process.removeAllListeners('SIGTERM');
    kill.mockRestore();
    jest.useRealTimers();
  });

  it('does nothing and never loads the SDK without the endpoint', () => {
    expect(startTracing({})).toBeUndefined();
    expect(mockSdkFactory).not.toHaveBeenCalled();
    expect(NodeSDK).not.toHaveBeenCalled();
  });

  it('does nothing when OTEL_SDK_DISABLED is "true"', () => {
    expect(startTracing({ ...enabled, OTEL_SDK_DISABLED: 'true' })).toBeUndefined();
    expect(NodeSDK).not.toHaveBeenCalled();
  });

  it('starts the SDK once with the six instrumentations', () => {
    const sdk = startTracing({ ...enabled });
    expect(NodeSDK).toHaveBeenCalledTimes(1);
    expect((NodeSDK as unknown as jest.Mock).mock.calls[0][0].instrumentations).toHaveLength(6);
    expect(sdk.start).toHaveBeenCalledTimes(1);
  });

  it('wires the ignore hook into the HTTP instrumentation, with MIND_TRACING_IGNORE_PATHS added', () => {
    startTracing({ ...enabled, MIND_TRACING_IGNORE_PATHS: '/ping' });
    const { ignoreIncomingRequestHook } = (HttpInstrumentation as unknown as jest.Mock).mock.calls[0][0];
    expect(ignoreIncomingRequestHook({ url: '/health/live' })).toBe(true);
    expect(ignoreIncomingRequestHook({ url: '/ping' })).toBe(true);
    expect(ignoreIncomingRequestHook({ url: '/health/trace' })).toBe(false);
  });

  it('defaults the metrics and logs exporters to none and keeps explicit values', () => {
    const env: NodeJS.ProcessEnv = { ...enabled, OTEL_LOGS_EXPORTER: 'otlp' };
    startTracing(env);
    expect(env.OTEL_METRICS_EXPORTER).toBe('none');
    expect(env.OTEL_LOGS_EXPORTER).toBe('otlp');
  });

  it('swallows an SDK failure: one line on stderr and the app keeps running', () => {
    (NodeSDK as unknown as jest.Mock).mockImplementationOnce(() => {
      throw new Error('boom');
    });
    const write = jest.spyOn(process.stderr, 'write').mockImplementation(() => true);
    expect(startTracing({ ...enabled })).toBeUndefined();
    expect(write).toHaveBeenCalledTimes(1);
    write.mockRestore();
  });

  it('flushes on SIGTERM and re-raises it when the app has no handler of its own', async () => {
    const sdk = startTracing({ ...enabled });
    (sdk.shutdown as jest.Mock).mockResolvedValue(undefined);
    process.emit('SIGTERM');
    await flushPromises();
    expect(sdk.shutdown).toHaveBeenCalledTimes(1);
    expect(kill).toHaveBeenCalledWith(process.pid, 'SIGTERM');
  });

  it('does not re-raise SIGTERM when the app registered its own handler', async () => {
    const sdk = startTracing({ ...enabled });
    (sdk.shutdown as jest.Mock).mockResolvedValue(undefined);
    process.on('SIGTERM', jest.fn());
    process.emit('SIGTERM');
    await flushPromises();
    expect(sdk.shutdown).toHaveBeenCalledTimes(1);
    expect(kill).not.toHaveBeenCalled();
  });

  it('stops waiting for a stuck shutdown after 5 s', async () => {
    jest.useFakeTimers();
    const sdk = startTracing({ ...enabled });
    (sdk.shutdown as jest.Mock).mockReturnValue(new Promise(() => undefined));
    process.emit('SIGTERM');
    expect(kill).not.toHaveBeenCalled();
    await jest.advanceTimersByTimeAsync(5000);
    expect(kill).toHaveBeenCalledWith(process.pid, 'SIGTERM');
  });
});
