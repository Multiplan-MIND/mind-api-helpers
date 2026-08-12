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
 * Normaliza para `Error` o valor capturado em um `catch`.
 *
 * Em JavaScript qualquer valor pode ser lançado, por isso o TypeScript tipa a variável do `catch`
 * como `unknown`. Use este helper antes de acessar `.message`/`.stack` ou de repassar o valor para
 * algo que espere um `Error`.
 */
export function toError(value: unknown): Error {
  if (value instanceof Error) return value;

  // Libs que rejeitam com objeto simples (drivers, clients HTTP) normalmente trazem `message`
  const message = (value as { message?: unknown })?.message;
  if (typeof message === 'string') return new Error(message);

  return new Error(stringifyValue(value));
}

function stringifyValue(value: unknown): string {
  if (typeof value === 'string') return value;
  try {
    // `JSON.stringify` devolve undefined para `undefined` e lança em referência circular
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
    // mantém o valor original: `Error` serializa como `{}`, mas objetos simples preservam os campos
    json = err as object;
  }
  return json;
}
