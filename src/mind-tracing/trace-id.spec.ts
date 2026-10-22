import { Span, trace } from '@opentelemetry/api';
import { currentTraceId } from './trace-id';

const spanWith = (traceId: string) =>
  ({ spanContext: () => ({ traceId, spanId: 'b7ad6b7169203331', traceFlags: 1 }) }) as Span;

describe('currentTraceId', () => {
  afterEach(() => jest.restoreAllMocks());

  it('returns undefined when there is no active span', () => expect(currentTraceId()).toBeUndefined());

  it('returns the trace id of a valid active span', () => {
    jest.spyOn(trace, 'getActiveSpan').mockReturnValue(spanWith('0af7651916cd43dd8448eb211c80319c'));
    expect(currentTraceId()).toBe('0af7651916cd43dd8448eb211c80319c');
  });

  it('returns undefined when the span context is invalid (all zeros)', () => {
    jest.spyOn(trace, 'getActiveSpan').mockReturnValue(spanWith('0'.repeat(32)));
    expect(currentTraceId()).toBeUndefined();
  });
});
