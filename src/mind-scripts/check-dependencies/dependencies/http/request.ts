import { CHECK_TIMEOUT_MILLISECONDS } from '../../core';
import type { HttpSettings } from '.';

/** O `fetch` falha só com "fetch failed" e deixa o motivo real (DNS, recusa, TLS) na causa. */
export async function request(url: string, init: RequestInit): Promise<Response> {
  try {
    return await fetch(url, { ...init, signal: AbortSignal.timeout(CHECK_TIMEOUT_MILLISECONDS) });
  } catch (error) {
    const cause = (error as { cause?: { code?: string; message?: string } }).cause;
    const causeDescription = cause?.code ?? cause?.message;
    if (!causeDescription) throw error;
    throw new Error(`${(error as Error).message} | cause=${causeDescription}`);
  }
}

/** O corpo em objeto vai como JSON; o texto vai como está, com o `content-type` que o arquivo der. */
export function buildInit({ method, headers, body }: HttpSettings): RequestInit {
  if (body === undefined) return { method, headers: { ...headers } };

  const isText = typeof body === 'string';
  const hasContentType = Object.keys(headers).some((name) => name.toLowerCase() === 'content-type');
  const contentType = isText || hasContentType ? {} : { 'content-type': 'application/json' };

  return { method, headers: { ...headers, ...contentType }, body: isText ? body : JSON.stringify(body) };
}
