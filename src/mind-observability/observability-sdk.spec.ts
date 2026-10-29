import { diag } from '@opentelemetry/api';
import { NodeSDK } from '@opentelemetry/sdk-node';
import { warnAboutNewerApiCopies } from './api-copies';
import { registerEsmLoaderHook } from './esm-loader-hook';
import { createInstrumentations } from './instrumentations';
import { startObservabilitySdk } from './observability-sdk';
import { registerShutdown } from './observability-shutdown';

jest.mock('@opentelemetry/sdk-node', () => ({
  NodeSDK: jest.fn().mockImplementation(() => ({ start: jest.fn(), shutdown: jest.fn() })),
}));
jest.mock('./instrumentations', () => ({ createInstrumentations: jest.fn(() => []) }));
jest.mock('./observability-shutdown', () => ({ registerShutdown: jest.fn() }));
jest.mock('./api-copies', () => ({ warnAboutNewerApiCopies: jest.fn() }));
jest.mock('./esm-loader-hook', () => ({ registerEsmLoaderHook: jest.fn() }));

type Integrations = { AI_SDK_TELEMETRY_INTEGRATIONS?: unknown[] };

const sdkConfig = () => jest.mocked(NodeSDK).mock.calls[0][0];

describe('startObservabilitySdk', () => {
  beforeEach(() => jest.clearAllMocks());

  afterEach(() => {
    delete (globalThis as Integrations).AI_SDK_TELEMETRY_INTEGRATIONS;
    diag.disable();
  });

  it('starts NodeSDK with the default resource, the detectors and the instrumentations, without a fixed exporter', () => {
    const sdk = startObservabilitySdk({});
    expect(sdk.start).toHaveBeenCalledTimes(1);
    expect(createInstrumentations).toHaveBeenCalledWith({});
    const config = sdkConfig();
    expect(config.resource).toBeDefined();
    expect(config.resourceDetectors.length).toBeGreaterThan(0);
    expect(config).not.toHaveProperty('traceExporter');
    expect(config).not.toHaveProperty('metricReaders');
  });

  it('turns logs off without touching the environment, unless OTEL_LOGS_EXPORTER is set', () => {
    const env: NodeJS.ProcessEnv = {};
    startObservabilitySdk(env);
    expect(sdkConfig().logRecordProcessors).toEqual([]);
    expect(env).toEqual({});

    jest.mocked(NodeSDK).mockClear();
    startObservabilitySdk({ OTEL_LOGS_EXPORTER: 'otlp' });
    expect(sdkConfig()).not.toHaveProperty('logRecordProcessors');
  });

  it('registers the ESM loader hook, the AI SDK integrations, the shutdown and the API copy check', () => {
    const sdk = startObservabilitySdk({});
    expect(registerEsmLoaderHook).toHaveBeenCalledTimes(1);
    expect((globalThis as Integrations).AI_SDK_TELEMETRY_INTEGRATIONS).toHaveLength(2);
    expect(registerShutdown).toHaveBeenCalledWith(sdk);
    expect(warnAboutNewerApiCopies).toHaveBeenCalledTimes(1);
  });
});
