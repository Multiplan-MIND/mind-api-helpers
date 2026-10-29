import type { Attributes, Span } from '@opentelemetry/api';

export const REDACTED = '<redacted>';

/**
 * Dado pessoal mascarado antes de a telemetria sair do processo. O `otelcol.processor.transform.redact` do
 * mind-api-observability aplica os mesmos padrões como segunda barreira; mudar um lado pede mudar o outro. A ordem
 * importa: o e-mail sai primeiro, porque pode conter dígitos.
 */
const PERSONAL_DATA_PATTERNS: RegExp[] = [
  /** E-mail, também com o @ codificado em URL. */
  /[A-Za-z0-9._%+-]+(?:@|%40)[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g,
  /** CPF com pontuação. */
  /\d{3}\.\d{3}\.\d{3}-\d{2}/g,
  /** Telefone com DDI 55, com ou sem o sinal de mais. */
  /(?<!\d)\+?55\d{10,11}(?!\d)/g,
  /** Telefone sem DDI ou CPF sem pontuação; timestamps em milissegundos (13 dígitos) e ids mais longos passam. */
  /(?<!\d)\d{10,11}(?!\d)/g,
];

/** Atributos de URL e de consulta em que um serviço pode ter posto um telefone, um CPF ou um e-mail. */
const MASKED_ATTRIBUTES = [
  'url.full',
  'url.path',
  'url.query',
  'http.target',
  'http.url',
  'db.query.text',
  'db.statement',
];

export function maskPersonalData(text: string): string {
  return PERSONAL_DATA_PATTERNS.reduce((masked, pattern) => masked.replace(pattern, REDACTED), text);
}

/**
 * Serializador de comando do ioredis: o nome do comando e a chave mascarada, nunca os valores. A chave costuma carregar
 * o telefone do cliente (`mind:concierge:conversation-history:<telefone>`).
 */
export function serializeRedisCommand(cmdName: string, cmdArgs: unknown[]): string {
  if (cmdArgs.length === 0) {
    return cmdName;
  }
  const [key, ...rest] = cmdArgs;
  const maskedKey = typeof key === 'string' || typeof key === 'number' ? maskPersonalData(String(key)) : '?';
  const others = rest.length > 0 ? ` [${rest.length} other arguments]` : '';
  return `${cmdName} ${maskedKey}${others}`;
}

/**
 * Hook de requisição das instrumentações http e undici: mascara os atributos de URL que a instrumentação acabou de
 * gravar no span. O span do SDK expõe os atributos em `attributes`; um span sem eles (o no-op) fica como está.
 */
export function maskSpanAttributes(span: Span): void {
  const attributes = readAttributes(span);
  if (!attributes) {
    return;
  }
  for (const key of MASKED_ATTRIBUTES) {
    const value = attributes[key];
    if (typeof value === 'string') {
      const masked = maskPersonalData(value);
      if (masked !== value) {
        span.setAttribute(key, masked);
      }
    }
  }
}

function readAttributes(span: Span): Attributes | undefined {
  const candidate: unknown = 'attributes' in span ? span.attributes : undefined;
  return isAttributes(candidate) ? candidate : undefined;
}

function isAttributes(value: unknown): value is Attributes {
  return typeof value === 'object' && value !== null;
}
