import { CHECK_TIMEOUT_MILLISECONDS, SettingsOf, defineDependency, field, loadDriver } from '../../core';
import { buildMongodbUri } from './mongodb-uri';
import { describeServerSelectionError } from './server-selection-error';

/** Os padrões são as variáveis que os serviços MIND já usam, então o serviço que as segue declara só o tipo. */
const fields = {
  protocol: field.text({ default: '${MONGO_PROTOCOL:-mongodb}' }),
  hosts: field.text({ default: '${MONGO_HOSTS}' }),
  /** Já codificadas, no formato `usuario:senha` que vai antes do `@` na URI. */
  credentials: field.text({ default: '${MONGO_USER_PASS:-}', secret: true }),
  database: field.text({ default: '${MONGO_DATABASE}' }),
  options: field.text({ default: '${MONGO_OPTIONS:-}' }),
};

export type MongodbSettings = SettingsOf<typeof fields>;

/** O `listCollections` exige autorização no banco configurado, que o `ping` sozinho não prova. */
async function checkMongodb(settings: MongodbSettings): Promise<void> {
  const { createConnection } = await loadDriver('mongoose', () => import('mongoose'));
  /**
   * A seleção limita a conexão, e o do socket limita o `ping` e a listagem de um servidor que para de responder. A
   * conexão termina dentro da seleção, para deixar o motivo de cada servidor na topologia do erro.
   */
  const connection = createConnection(buildMongodbUri(settings), {
    serverSelectionTimeoutMS: CHECK_TIMEOUT_MILLISECONDS,
    connectTimeoutMS: CHECK_TIMEOUT_MILLISECONDS / 2,
    socketTimeoutMS: CHECK_TIMEOUT_MILLISECONDS,
  });
  try {
    await connection.asPromise().catch((error: unknown) => {
      throw describeServerSelectionError(error);
    });
    if (!connection.db) throw new Error('The MongoDB connection opened without a database handle');
    await connection.db.command({ ping: 1 });
    await connection.db.listCollections({}, { nameOnly: true }).toArray();
  } finally {
    await connection.close(true);
  }
}

export const mongodb = defineDependency({ fields, check: checkMongodb });
