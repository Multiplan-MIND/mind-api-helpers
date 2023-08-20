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

export function jsonError(err: Error) {
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
    json = err;
  }
  return json;
}
