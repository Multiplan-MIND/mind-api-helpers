/**
 * Testes executados:
 * - redis.fields
 *   - resolve os campos com as variáveis dos serviços MIND e converte a porta
 *   - aponta a porta inválida
 * - redis.check
 *   - grava e remove a chave de teste sob o prefixo e desconecta
 *   - falha quando a remoção não acha a chave gravada
 *   - traz para o erro o motivo real da conexão recusada
 */

import { Redis } from 'ioredis';

import { redis } from '.';
import { resolveFields } from '../resolve-fields.spec-helper';

/** Configuração */
jest.mock('ioredis', () => ({ Redis: jest.fn() }));

afterEach(() => {
  jest.clearAllMocks();
});

/** Fixtures */
const SETTINGS = { host: 'redis.example.com', port: 6379, keyPrefix: 'mind:app:' };

/** Factories/helpers */
function mockClient({ deleted = 1, connectionError }: { deleted?: number; connectionError?: Error } = {}) {
  let onError: (error: Error) => void = () => undefined;
  const client = {
    on: jest.fn((event: string, listener: (error: Error) => void) => {
      if (event === 'error') onError = listener;
    }),
    connect: jest.fn(() => {
      if (!connectionError) return Promise.resolve();
      onError(connectionError);
      return Promise.reject(new Error('Connection is closed.'));
    }),
    set: jest.fn().mockResolvedValue('OK'),
    del: jest.fn().mockResolvedValue(deleted),
    disconnect: jest.fn(),
  };
  jest.mocked(Redis).mockImplementation(() => client as unknown as Redis);

  return client;
}

/** Testes */
describe('redis.fields', () => {
  it('resolve os campos com as variáveis dos serviços MIND e converte a porta', () => {
    const environment = { REDIS_HOST: 'redis.example.com', REDIS_PORT: '6380' };

    expect(resolveFields(redis, {}, environment).settings).toEqual({
      host: 'redis.example.com',
      port: 6380,
      keyPrefix: '',
    });
    expect(resolveFields(redis, { port: 6390 }, environment).settings).toEqual(expect.objectContaining({ port: 6390 }));
  });

  it('aponta a porta inválida', () => {
    expect(resolveFields(redis, {}, { REDIS_HOST: 'redis', REDIS_PORT: '63a9' }).problems).toEqual([
      'port of "dependency" must be a number between 1 and 65535',
    ]);
  });
});

describe('redis.check', () => {
  it('grava e remove a chave de teste sob o prefixo e desconecta', async () => {
    const client = mockClient();

    await redis.check(SETTINGS);

    expect(Redis).toHaveBeenCalledWith(expect.objectContaining(SETTINGS));
    expect(client.set).toHaveBeenCalledWith(expect.stringMatching(/^dependency-check:/), 'ok', 'EX', 60);
    expect(client.del).toHaveBeenCalledWith(client.set.mock.calls[0][0]);
    expect(client.disconnect).toHaveBeenCalled();
  });

  it('falha quando a remoção não acha a chave gravada', async () => {
    const client = mockClient({ deleted: 0 });

    await expect(redis.check(SETTINGS)).rejects.toThrow('Redis did not keep the key just written');
    expect(client.disconnect).toHaveBeenCalled();
  });

  it('traz para o erro o motivo real da conexão recusada', async () => {
    mockClient({ connectionError: new Error('connect ECONNREFUSED') });

    await expect(redis.check(SETTINGS)).rejects.toThrow('connect ECONNREFUSED');
  });
});
