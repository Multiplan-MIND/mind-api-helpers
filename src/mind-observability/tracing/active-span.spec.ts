import { Span, trace } from '@opentelemetry/api';
import { currentSpanIds, currentTraceId, markActiveSpanWithLog } from './active-span';

const spanWith = (traceId: string) =>
  ({
    spanContext: () => ({ traceId, spanId: 'b7ad6b7169203331', traceFlags: 1 }),
    setAttribute: jest.fn(),
  }) as unknown as Span;

describe('active-span', () => {
  afterEach(() => jest.restoreAllMocks());

  it('returns undefined when there is no active span', () => {
    expect(currentTraceId()).toBeUndefined();
    expect(currentSpanIds()).toBeUndefined();
  });

  it('returns the trace and span ids of a valid active span', () => {
    jest.spyOn(trace, 'getActiveSpan').mockReturnValue(spanWith('0af7651916cd43dd8448eb211c80319c'));
    expect(currentTraceId()).toBe('0af7651916cd43dd8448eb211c80319c');
    expect(currentSpanIds()).toEqual({ traceId: '0af7651916cd43dd8448eb211c80319c', spanId: 'b7ad6b7169203331' });
  });

  it('returns undefined when the span context is invalid (all zeros)', () => {
    jest.spyOn(trace, 'getActiveSpan').mockReturnValue(spanWith('0'.repeat(32)));
    expect(currentTraceId()).toBeUndefined();
    expect(currentSpanIds()).toBeUndefined();
  });

  it('marks the active span with the severity of the log line', () => {
    const span = spanWith('0af7651916cd43dd8448eb211c80319c');
    jest.spyOn(trace, 'getActiveSpan').mockReturnValue(span);
    markActiveSpanWithLog('warn');
    markActiveSpanWithLog('error');
    expect(span.setAttribute).toHaveBeenCalledWith('mind.log.warn', true);
    expect(span.setAttribute).toHaveBeenCalledWith('mind.log.error', true);
  });

  it('does nothing outside a span', () => {
    expect(() => markActiveSpanWithLog('error')).not.toThrow();
  });
});
