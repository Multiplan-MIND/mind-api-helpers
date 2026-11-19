import { isSpanContextValid, trace } from '@opentelemetry/api';

export interface SpanIds {
  traceId: string;
  spanId: string;
}

export type LoggedSeverity = 'warn' | 'error';

/** Ids de trace e de span do span ativo, ou undefined sem span ativo ou com contexto inválido. */
export function currentSpanIds(): SpanIds | undefined {
  const spanContext = trace.getActiveSpan()?.spanContext();
  return spanContext && isSpanContextValid(spanContext)
    ? { traceId: spanContext.traceId, spanId: spanContext.spanId }
    : undefined;
}

/** Id de trace do span ativo, ou undefined sem span ativo ou com contexto inválido. */
export function currentTraceId(): string | undefined {
  return currentSpanIds()?.traceId;
}

/**
 * Marca o span ativo com `mind.log.warn` ou `mind.log.error` quando uma linha de log dessa severidade é escrita dentro
 * dele, para um coletor com tail sampling guardar todo trace que tenha uma linha de aviso ou de erro. Fora de um span,
 * não faz nada.
 */
export function markActiveSpanWithLog(severity: LoggedSeverity): void {
  trace.getActiveSpan()?.setAttribute(`mind.log.${severity}`, true);
}
