/**
 * Testes executados:
 * - http.fields
 *   - usa GET, exige 2xx e não espera valor quando o arquivo só dá a url
 *   - guarda como segredo os cabeçalhos e o corpo
 *   - recusa no expect o valor que não é texto, número, booleano ou nulo
 * - http.check
 *   - aceita a resposta 2xx e envia método e cabeçalhos
 *   - envia o corpo em objeto como JSON
 *   - recusa a resposta fora de 2xx
 *   - aceita qualquer status e redirecionamento quando o arquivo pede
 *   - confere o valor esperado em cada caminho do JSON
 *   - recusa a resposta sem o valor esperado e não cita o valor recebido
 *   - traz o motivo da falha de conexão para a mensagem
 */

import { IncomingMessage, Server, ServerResponse, createServer } from 'node:http';
import { AddressInfo } from 'node:net';

import { HttpSettings, http } from '.';
import { resolveFields } from '../resolve-fields.spec-helper';

/** Configuração */
type Handler = (request: IncomingMessage, body: string, response: ServerResponse) => void;

let server: Server;
let baseUrl: string;
let handler: Handler;

beforeAll(async () => {
  server = createServer((request, response) => {
    let body = '';
    request.on('data', (chunk) => (body += chunk));
    request.on('end', () => handler(request, body, response));
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});

afterAll(async () => {
  await new Promise((resolve) => server.close(resolve));
});

/** Factories/helpers */
function settings(overrides: Partial<HttpSettings> = {}): HttpSettings {
  return {
    url: baseUrl,
    method: 'GET',
    headers: {},
    body: undefined,
    acceptAnyStatus: false,
    expect: {},
    ...overrides,
  };
}

function respondWith(status: number, body = '', headers: Record<string, string> = {}): jest.Mock {
  const received = jest.fn();
  handler = (request, requestBody, response) => {
    received({ method: request.method, headers: request.headers, body: requestBody });
    response.writeHead(status, headers).end(body);
  };

  return received;
}

/** Testes */
describe('http.fields', () => {
  it('usa GET, exige 2xx e não espera valor quando o arquivo só dá a url', () => {
    expect(resolveFields(http, { url: 'https://api.example.com' }, {}).settings).toEqual({
      url: 'https://api.example.com',
      method: 'GET',
      headers: {},
      body: undefined,
      acceptAnyStatus: false,
      expect: {},
    });
  });

  it('guarda como segredo os cabeçalhos e o corpo', () => {
    const fields = {
      url: 'https://${API_HOST}',
      headers: { Authorization: 'Bearer ${API_TOKEN}' },
      body: { token: '${QUERY_TOKEN}' },
    };
    const environment = { API_HOST: 'api.example.com', API_TOKEN: 'api-token', QUERY_TOKEN: 'query-token' };

    expect(resolveFields(http, fields, environment).secrets).toEqual(['api-token', 'query-token']);
  });

  it('recusa no expect o valor que não é texto, número, booleano ou nulo', () => {
    expect(http.fields.expect.accepts({ 'data.id': 1, 'data.name': null })).toBe(true);
    expect(http.fields.expect.accepts({ 'data.id': [] })).toBe(false);
  });
});

describe('http.check', () => {
  it('aceita a resposta 2xx e envia método e cabeçalhos', async () => {
    const received = respondWith(200);

    await http.check(settings({ method: 'HEAD', headers: { 'x-api-key': 'key' } }));

    expect(received).toHaveBeenCalledWith(
      expect.objectContaining({ method: 'HEAD', headers: expect.objectContaining({ 'x-api-key': 'key' }) }),
    );
  });

  it('envia o corpo em objeto como JSON', async () => {
    const received = respondWith(200);

    await http.check(settings({ method: 'POST', body: { query: '{ __typename }' } }));

    expect(received).toHaveBeenCalledWith(
      expect.objectContaining({
        body: '{"query":"{ __typename }"}',
        headers: expect.objectContaining({ 'content-type': 'application/json' }),
      }),
    );
  });

  it('recusa a resposta fora de 2xx', async () => {
    respondWith(401);

    await expect(http.check(settings())).rejects.toThrow('Unexpected HTTP status | httpStatus=401');
  });

  it('aceita qualquer status e redirecionamento quando o arquivo pede', async () => {
    respondWith(500);
    await expect(http.check(settings({ acceptAnyStatus: true }))).resolves.toBeUndefined();

    respondWith(302, '', { location: 'https://example.com' });
    await expect(http.check(settings({ acceptAnyStatus: true }))).resolves.toBeUndefined();
    await expect(http.check(settings())).rejects.toThrow();
  });

  it('confere o valor esperado em cada caminho do JSON', async () => {
    respondWith(200, JSON.stringify({ data: { __typename: 'Query', count: 0 } }));

    await expect(
      http.check(settings({ expect: { 'data.__typename': 'Query', 'data.count': 0 } })),
    ).resolves.toBeUndefined();
  });

  it('recusa a resposta sem o valor esperado e não cita o valor recebido', async () => {
    respondWith(200, JSON.stringify({ data: { __typename: 'customer-data' } }));

    const error = await http.check(settings({ expect: { 'data.__typename': 'Query' } })).catch((caught) => caught);

    expect(error.message).toBe('Unexpected response body | path=data.__typename expected="Query"');
  });

  it('traz o motivo da falha de conexão para a mensagem', async () => {
    const closedServer = createServer();
    await new Promise<void>((resolve) => closedServer.listen(0, '127.0.0.1', resolve));
    const { port } = closedServer.address() as AddressInfo;
    await new Promise((resolve) => closedServer.close(resolve));

    await expect(http.check(settings({ url: `http://127.0.0.1:${port}` }))).rejects.toThrow(
      'fetch failed | cause=ECONNREFUSED',
    );
  });
});
