/**
 * Testes executados:
 * - rabbitmq.fields
 *   - resolve os campos com as variáveis dos serviços MIND e guarda o usuário e a senha como segredo
 * - buildAmqpUri
 *   - codifica o usuário, a senha e o vhost
 * - rabbitmq.check
 *   - confere cada exchange de forma passiva e fecha a conexão
 *   - fecha a conexão quando um exchange não existe
 */

import { connect } from 'amqplib';

import { RabbitmqSettings, rabbitmq } from '.';
import { resolveFields } from '../resolve-fields.spec-helper';
import { buildAmqpUri } from './amqp-uri';

/** Configuração */
jest.mock('amqplib', () => ({ connect: jest.fn() }));

afterEach(() => {
  jest.clearAllMocks();
});

/** Fixtures */
const SETTINGS: RabbitmqSettings = {
  protocol: 'amqps',
  user: 'mind user',
  password: 'p@ss/word',
  host: 'rabbit.example.com',
  port: 5671,
  vhost: '/',
  exchanges: ['webhook-created', 'webhook-processed'],
};

/** Factories/helpers */
function mockConnection(checkExchangeError?: Error) {
  const channel = {
    on: jest.fn(),
    checkExchange: jest.fn(() => (checkExchangeError ? Promise.reject(checkExchangeError) : Promise.resolve({}))),
  };
  const connection = {
    on: jest.fn(),
    createChannel: jest.fn().mockResolvedValue(channel),
    close: jest.fn().mockResolvedValue(undefined),
  };
  jest.mocked(connect).mockResolvedValue(connection as unknown as Awaited<ReturnType<typeof connect>>);

  return { connection, channel };
}

/** Testes */
describe('rabbitmq.fields', () => {
  it('resolve os campos com as variáveis dos serviços MIND e guarda o usuário e a senha como segredo', () => {
    const environment = {
      AMQP_USER: 'guest',
      AMQP_PASS: 'amqp-secret',
      AMQP_URL: 'rabbit.example.com',
      AMQP_VHOST: 'mind',
      EXCHANGE: 'created',
    };
    const { settings, secrets } = resolveFields(rabbitmq, { exchanges: ['${EXCHANGE}', 'processed'] }, environment);

    expect(settings).toEqual({
      protocol: 'amqp',
      user: 'guest',
      password: 'amqp-secret',
      host: 'rabbit.example.com',
      port: 5672,
      vhost: 'mind',
      exchanges: ['created', 'processed'],
    });
    expect(secrets).toEqual(['amqp-secret', 'guest']);
  });
});

describe('buildAmqpUri', () => {
  it('codifica o usuário, a senha e o vhost', () => {
    expect(buildAmqpUri(SETTINGS)).toBe('amqps://mind%20user:p%40ss%2Fword@rabbit.example.com:5671/%2F');
  });
});

describe('rabbitmq.check', () => {
  it('confere cada exchange de forma passiva e fecha a conexão', async () => {
    const { connection, channel } = mockConnection();

    await rabbitmq.check(SETTINGS);

    expect(connect).toHaveBeenCalledWith(buildAmqpUri(SETTINGS), expect.objectContaining({ timeout: 10_000 }));
    expect(channel.checkExchange.mock.calls).toEqual([['webhook-created'], ['webhook-processed']]);
    expect(connection.close).toHaveBeenCalled();
  });

  it('fecha a conexão quando um exchange não existe', async () => {
    const { connection } = mockConnection(new Error('NOT_FOUND - no exchange'));

    await expect(rabbitmq.check(SETTINGS)).rejects.toThrow('NOT_FOUND - no exchange');
    expect(connection.close).toHaveBeenCalled();
  });
});
