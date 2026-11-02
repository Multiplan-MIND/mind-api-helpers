/**
 * Testes executados:
 * - liga com endpoint e sem OTEL_SDK_DISABLED
 * - desliga com OTEL_SDK_DISABLED "true" em qualquer caixa, ou sem endpoint
 * - não inicia o SDK quando desligada
 * - inicia o SDK com o ambiente quando ligada
 * - engole uma falha do SDK: uma linha no stderr e a aplicação segue
 */

import { startObservabilitySdk } from './observability-sdk';
import { isObservabilityEnabled, startObservability } from './start-observability';

/** Configuração: o SDK é substituído, para o teste ver só a decisão de ligar. */
jest.mock('./observability-sdk', () => ({ startObservabilitySdk: jest.fn(() => ({ started: true })) }));

/** Fixtures: ambiente mínimo com a telemetria ligada. */
const endpoint = { OTEL_EXPORTER_OTLP_ENDPOINT: 'http://collector:4318' };

/** Testes */
describe('startObservability', () => {
  beforeEach(() => jest.mocked(startObservabilitySdk).mockClear());

  it('liga com endpoint e sem OTEL_SDK_DISABLED', () => {
    expect(isObservabilityEnabled(endpoint)).toBe(true);
    expect(isObservabilityEnabled({ ...endpoint, OTEL_SDK_DISABLED: 'false' })).toBe(true);
  });

  it('desliga com OTEL_SDK_DISABLED "true" em qualquer caixa, ou sem endpoint', () => {
    expect(isObservabilityEnabled({ ...endpoint, OTEL_SDK_DISABLED: 'true' })).toBe(false);
    expect(isObservabilityEnabled({ ...endpoint, OTEL_SDK_DISABLED: ' TRUE ' })).toBe(false);
    expect(isObservabilityEnabled({})).toBe(false);
    expect(isObservabilityEnabled({ OTEL_EXPORTER_OTLP_ENDPOINT: '  ' })).toBe(false);
  });

  it('não inicia o SDK quando desligada', () => {
    expect(startObservability({ ...endpoint, OTEL_SDK_DISABLED: 'true' })).toBeUndefined();
    expect(startObservability({})).toBeUndefined();
    expect(startObservabilitySdk).not.toHaveBeenCalled();
  });

  it('inicia o SDK com o ambiente quando ligada', () => {
    expect(startObservability(endpoint)).toEqual({ started: true });
    expect(startObservabilitySdk).toHaveBeenCalledWith(endpoint);
  });

  it('engole uma falha do SDK: uma linha no stderr e a aplicação segue', () => {
    jest.mocked(startObservabilitySdk).mockImplementationOnce(() => {
      throw new Error('boom');
    });
    const write = jest.spyOn(process.stderr, 'write').mockImplementation(() => true);
    expect(startObservability(endpoint)).toBeUndefined();
    expect(write).toHaveBeenCalledTimes(1);
    expect(write.mock.calls[0][0]).toContain('boom');
    write.mockRestore();
  });
});
