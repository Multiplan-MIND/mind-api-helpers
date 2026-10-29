/**
 * Testes executados:
 * - devolve undefined quando não há span ativo
 * - devolve os ids de trace e de span de um span ativo válido
 * - devolve undefined quando o contexto do span é inválido (só zeros)
 * - marca o span ativo com a severidade da linha de log
 * - não faz nada fora de um span
 */

import { Span, trace } from '@opentelemetry/api';
import { currentSpanIds, currentTraceId, markActiveSpanWithLog } from './active-span';

/** Factories/helpers: span ativo falso com o trace id dado. */
const spanWith = (traceId: string) =>
  ({
    spanContext: () => ({ traceId, spanId: 'b7ad6b7169203331', traceFlags: 1 }),
    setAttribute: jest.fn(),
  }) as unknown as Span;

/** Testes */
describe('active-span', () => {
  afterEach(() => jest.restoreAllMocks());

  it('devolve undefined quando não há span ativo', () => {
    expect(currentTraceId()).toBeUndefined();
    expect(currentSpanIds()).toBeUndefined();
  });

  it('devolve os ids de trace e de span de um span ativo válido', () => {
    jest.spyOn(trace, 'getActiveSpan').mockReturnValue(spanWith('0af7651916cd43dd8448eb211c80319c'));
    expect(currentTraceId()).toBe('0af7651916cd43dd8448eb211c80319c');
    expect(currentSpanIds()).toEqual({ traceId: '0af7651916cd43dd8448eb211c80319c', spanId: 'b7ad6b7169203331' });
  });

  it('devolve undefined quando o contexto do span é inválido (só zeros)', () => {
    jest.spyOn(trace, 'getActiveSpan').mockReturnValue(spanWith('0'.repeat(32)));
    expect(currentTraceId()).toBeUndefined();
    expect(currentSpanIds()).toBeUndefined();
  });

  it('marca o span ativo com a severidade da linha de log', () => {
    const span = spanWith('0af7651916cd43dd8448eb211c80319c');
    jest.spyOn(trace, 'getActiveSpan').mockReturnValue(span);
    markActiveSpanWithLog('warn');
    markActiveSpanWithLog('error');
    expect(span.setAttribute).toHaveBeenCalledWith('mind.log.warn', true);
    expect(span.setAttribute).toHaveBeenCalledWith('mind.log.error', true);
  });

  it('não faz nada fora de um span', () => {
    expect(() => markActiveSpanWithLog('error')).not.toThrow();
  });
});
