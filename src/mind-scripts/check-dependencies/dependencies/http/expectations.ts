import { Field, isPlainObject } from '../../core';

export type JsonPrimitive = string | number | boolean | null;

function isJsonPrimitive(value: unknown): value is JsonPrimitive {
  return value === null || ['string', 'number', 'boolean'].includes(typeof value);
}

/** O campo `expect`: caminhos com ponto da resposta JSON e o valor esperado em cada um, vazio por padrão. */
export function expectations(): Field<Record<string, JsonPrimitive>> {
  return {
    description: 'an object of JSON paths to string, number, boolean or null',
    required: false,
    accepts: (raw) => isPlainObject(raw) && Object.values(raw).every(isJsonPrimitive),
    resolve: (raw) =>
      Object.fromEntries(
        Object.entries(isPlainObject(raw) ? raw : {}).filter((entry): entry is [string, JsonPrimitive] =>
          isJsonPrimitive(entry[1]),
        ),
      ),
  };
}

function readPath(value: unknown, path: string): unknown {
  return path
    .split('.')
    .reduce<unknown>(
      (current, key) => (typeof current === 'object' && current !== null ? Reflect.get(current, key) : undefined),
      value,
    );
}

/** Só o caminho e o valor esperado entram no erro: o valor recebido pode trazer dado da API. */
export async function assertExpectations(response: Response, expected: Record<string, JsonPrimitive>): Promise<void> {
  const paths = Object.keys(expected);
  if (paths.length === 0) return;

  const body: unknown = await response.json().catch(() => undefined);
  const failedPath = paths.find((path) => readPath(body, path) !== expected[path]);
  if (failedPath) {
    throw new Error(`Unexpected response body | path=${failedPath} expected=${JSON.stringify(expected[failedPath])}`);
  }
}
