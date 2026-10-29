/**
 * Testes executados:
 * - inicia o NodeSDK com o recurso padrão, os detectores e as instrumentações, sem exporter fixo
 * - desliga os logs sem mexer no ambiente, a não ser que OTEL_LOGS_EXPORTER esteja definida
 * - registra o hook ESM, as integrações do AI SDK, o encerramento e a checagem de cópias da API
 */

import { diag } from '@opentelemetry/api';
import { NodeSDK } from '@opentelemetry/sdk-node';
import { warnAboutNewerApiCopies } from './api-copies';
import { registerEsmLoaderHook } from './esm-loader-hook';
import { createInstrumentations } from './instrumentations';
import { startObservabilitySdk } from './observability-sdk';
import { registerShutdown } from './observability-shutdown';

/** Configuração: o SDK e as peças com efeito no processo são substituídos, para o teste ver só a montagem. */
jest.mock('@opentelemetry/sdk-node', () => ({
  NodeSDK: jest.fn().mockImplementation(() => ({ start: jest.fn(), shutdown: jest.fn() })),
}));
jest.mock('./instrumentations', () => ({ createInstrumentations: jest.fn(() => []) }));
jest.mock('./observability-shutdown', () => ({ registerShutdown: jest.fn() }));
jest.mock('./api-copies', () => ({ warnAboutNewerApiCopies: jest.fn() }));
jest.mock('./esm-loader-hook', () => ({ registerEsmLoaderHook: jest.fn() }));

type Integrations = { AI_SDK_TELEMETRY_INTEGRATIONS?: unknown[] };

/** Factories/helpers: configuração recebida pelo NodeSDK na primeira construção. */
const sdkConfig = () => jest.mocked(NodeSDK).mock.calls[0][0];

/** Testes */
describe('startObservabilitySdk', () => {
  beforeEach(() => jest.clearAllMocks());

  afterEach(() => {
    delete (globalThis as Integrations).AI_SDK_TELEMETRY_INTEGRATIONS;
    diag.disable();
  });

  it('inicia o NodeSDK com o recurso padrão, os detectores e as instrumentações, sem exporter fixo', () => {
    const sdk = startObservabilitySdk({});
    expect(sdk.start).toHaveBeenCalledTimes(1);
    expect(createInstrumentations).toHaveBeenCalledWith({});
    const config = sdkConfig();
    expect(config.resource).toBeDefined();
    expect(config.resourceDetectors.length).toBeGreaterThan(0);
    expect(config).not.toHaveProperty('traceExporter');
    expect(config).not.toHaveProperty('metricReaders');
  });

  it('desliga os logs sem mexer no ambiente, a não ser que OTEL_LOGS_EXPORTER esteja definida', () => {
    const env: NodeJS.ProcessEnv = {};
    startObservabilitySdk(env);
    expect(sdkConfig().logRecordProcessors).toEqual([]);
    expect(env).toEqual({});

    jest.mocked(NodeSDK).mockClear();
    startObservabilitySdk({ OTEL_LOGS_EXPORTER: 'otlp' });
    expect(sdkConfig()).not.toHaveProperty('logRecordProcessors');
  });

  it('registra o hook ESM, as integrações do AI SDK, o encerramento e a checagem de cópias da API', () => {
    const sdk = startObservabilitySdk({});
    expect(registerEsmLoaderHook).toHaveBeenCalledTimes(1);
    expect((globalThis as Integrations).AI_SDK_TELEMETRY_INTEGRATIONS).toHaveLength(2);
    expect(registerShutdown).toHaveBeenCalledWith(sdk);
    expect(warnAboutNewerApiCopies).toHaveBeenCalledTimes(1);
  });
});
