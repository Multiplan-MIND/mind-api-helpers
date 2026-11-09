/**
 * Testes executados:
 * - mongodb.fields
 *   - resolve os campos com as variáveis dos serviços MIND e guarda as credenciais como segredo
 *   - deixa o campo do arquivo valer sobre o padrão
 * - buildMongodbUri
 *   - monta a URI com credenciais, banco e opções
 *   - omite as credenciais vazias e aceita as opções com ou sem o ?
 * - mongodb.check
 *   - faz ping, lista as coleções e fecha a conexão
 *   - descreve cada servidor da topologia no erro de seleção
 */

import { createConnection } from 'mongoose';

import { MongodbSettings, mongodb } from '.';
import { resolveFields } from '../resolve-fields.spec-helper';
import { buildMongodbUri } from './mongodb-uri';

/** Configuração */
jest.mock('mongoose', () => ({ createConnection: jest.fn() }));

afterEach(() => {
  jest.clearAllMocks();
});

/** Fixtures */
const SETTINGS: MongodbSettings = {
  protocol: 'mongodb+srv',
  hosts: 'cluster.example.com',
  credentials: 'user:secret',
  database: 'app',
  options: 'retryWrites=true',
};

/** Factories/helpers */
function mockConnection(openError?: Error) {
  const toArray = jest.fn().mockResolvedValue([]);
  const connection = {
    asPromise: jest.fn(() => (openError ? Promise.reject(openError) : Promise.resolve())),
    db: { command: jest.fn().mockResolvedValue({ ok: 1 }), listCollections: jest.fn(() => ({ toArray })) },
    close: jest.fn().mockResolvedValue(undefined),
  };
  jest.mocked(createConnection).mockReturnValue(connection as unknown as ReturnType<typeof createConnection>);

  return { connection, toArray };
}

const SERVICE_ENVIRONMENT: NodeJS.ProcessEnv = {
  MONGO_HOSTS: 'mongo.example.com',
  MONGO_USER_PASS: 'user:secret',
  MONGO_DATABASE: 'app',
};

/** Testes */
describe('mongodb.fields', () => {
  it('resolve os campos com as variáveis dos serviços MIND e guarda as credenciais como segredo', () => {
    const { settings, secrets, missingVariables } = resolveFields(mongodb, {}, SERVICE_ENVIRONMENT);

    expect(settings).toEqual({
      protocol: 'mongodb',
      hosts: 'mongo.example.com',
      credentials: 'user:secret',
      database: 'app',
      options: '',
    });
    expect(secrets).toEqual(['user:secret']);
    expect(missingVariables).toEqual([]);
  });

  it('deixa o campo do arquivo valer sobre o padrão', () => {
    const environment = { ...SERVICE_ENVIRONMENT, REPORTS_HOSTS: 'reports.example.com' };

    expect(resolveFields(mongodb, { hosts: '${REPORTS_HOSTS}' }, environment).settings).toEqual(
      expect.objectContaining({ hosts: 'reports.example.com' }),
    );
  });
});

describe('buildMongodbUri', () => {
  it('monta a URI com credenciais, banco e opções', () => {
    expect(buildMongodbUri(SETTINGS)).toBe('mongodb+srv://user:secret@cluster.example.com/app?retryWrites=true');
  });

  it('omite as credenciais vazias e aceita as opções com ou sem o ?', () => {
    const local = { ...SETTINGS, protocol: 'mongodb', hosts: 'localhost:27017', credentials: '' };

    expect(buildMongodbUri({ ...local, options: '?authSource=admin' })).toBe(
      'mongodb://localhost:27017/app?authSource=admin',
    );
    expect(buildMongodbUri({ ...local, options: '' })).toBe('mongodb://localhost:27017/app');
  });
});

describe('mongodb.check', () => {
  it('faz ping, lista as coleções e fecha a conexão', async () => {
    const { connection, toArray } = mockConnection();

    await mongodb.check(SETTINGS);

    expect(createConnection).toHaveBeenCalledWith(buildMongodbUri(SETTINGS), expect.any(Object));
    expect(connection.db.command).toHaveBeenCalledWith({ ping: 1 });
    expect(toArray).toHaveBeenCalled();
    expect(connection.close).toHaveBeenCalledWith(true);
  });

  it('descreve cada servidor da topologia no erro de seleção', async () => {
    const selectionError = Object.assign(new Error('Server selection timed out'), {
      reason: {
        type: 'ReplicaSetNoPrimary',
        servers: new Map([
          ['a:27017', { address: 'a:27017', type: 'Unknown', error: { message: 'connect ECONNREFUSED' } }],
          ['b:27017', { address: 'b:27017', type: 'RSSecondary' }],
        ]),
      },
    });
    const { connection } = mockConnection(selectionError);

    await expect(mongodb.check(SETTINGS)).rejects.toThrow(
      'Server selection timed out | topology=ReplicaSetNoPrimary servers=a:27017=Unknown(connect ECONNREFUSED) b:27017=RSSecondary',
    );
    expect(connection.close).toHaveBeenCalled();
  });
});
