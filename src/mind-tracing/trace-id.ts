import { isSpanContextValid, trace } from '@opentelemetry/api';

/** Trace id of the active span, or undefined when there is no active span or its context is invalid. */
export function currentTraceId(): string | undefined {
  const spanContext = trace.getActiveSpan()?.spanContext();
  return spanContext && isSpanContextValid(spanContext) ? spanContext.traceId : undefined;
}
