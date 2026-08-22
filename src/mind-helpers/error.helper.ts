import axios from 'axios';

type Jsonable =
  | string
  | number
  | boolean
  | null
  | undefined
  | readonly Jsonable[]
  | { readonly [key: string]: Jsonable }
  | { toJSON(): Jsonable };

export class MindError extends Error {
  public readonly code: string;
  public readonly cause?: Error;
  public readonly context?: Jsonable;

  constructor(code: string, message: string, options: { cause?: Error; context?: Jsonable } = {}) {
    super(message);
    const { cause, context } = options;

    this.code = code;
    this.name = this.constructor.name;
    this.cause = cause;
    this.context = context;
  }
}

/**
 * An error caught in a `catch`, with properties that drivers and HTTP clients typically attach.
 *
 * `code` covers both MongoDB error numbers (11000 is duplicate key) and text codes from
 * Node and axios ('ECONNREFUSED', 'ERR_BAD_REQUEST'), without needing a cast at the call site.
 * For axios error fields (`response`, `config`), use `axios.isAxiosError(e)`, which narrows
 * the type correctly.
 */
export interface ThrownError extends Error {
  code?: string | number;
}

/**
 * Normalizes the value caught in a `catch` to an `Error`.
 *
 * In JavaScript any value can be thrown, so TypeScript types the `catch` variable
 * as `unknown`. Use this helper before accessing `.message`/`.stack` or passing the value to
 * something that expects an `Error`.
 */
export function toError(value: unknown): ThrownError {
  if (value instanceof Error) return value;

  // Libs that reject with a plain object (drivers, HTTP clients) usually carry `message`
  const source = value as { message?: unknown; code?: unknown };
  if (typeof source?.message === 'string') {
    const error: ThrownError = new Error(source.message);
    if (typeof source.code === 'string' || typeof source.code === 'number') error.code = source.code;
    return error;
  }

  return new Error(stringifyValue(value));
}

function stringifyValue(value: unknown): string {
  if (typeof value === 'string') return value;
  try {
    // `JSON.stringify` returns undefined for `undefined` and throws on circular references
    return JSON.stringify(value) ?? String(value);
  } catch {
    return String(value);
  }
}

export function jsonError(err: unknown) {
  let json = {};
  if (axios.isAxiosError(err)) {
    if (err?.response?.config) {
      if (err?.response?.config?.headers) {
        delete err?.response?.config?.headers['X-API-KEY'];
        delete err?.response?.config?.headers['Authorization'];
        delete err?.response?.config?.headers['Apikey'];
        delete err?.response?.config?.headers['x-api-key'];
        delete err?.response?.config?.headers['WPS-API-KEY'];
      }
      if (err?.response?.config?.data && err?.response?.config?.data instanceof Buffer)
        delete err?.response?.config?.data;
    }
    json = {
      config: err.response.config,
      data: err.response.data,
      headers: err.response.headers,
      status: err.response.status,
      statusText: err.response.statusText,
      code: err.code,
      name: err.name,
      message: err.message,
      stack: err.stack,
    };
  } else {
    // preserves the original value: `Error` serializes as `{}`, but plain objects preserve their fields
    json = err as object;
  }
  return json;
}
