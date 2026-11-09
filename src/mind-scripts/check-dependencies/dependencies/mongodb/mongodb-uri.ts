import type { MongodbSettings } from '.';

/** Monta a URI como os serviços MIND: as credenciais já vêm codificadas, e as opções podem vir com ou sem o `?`. */
export function buildMongodbUri({ protocol, hosts, credentials, database, options }: MongodbSettings): string {
  const userInfo = credentials ? `${credentials}@` : '';
  const query = options.replace(/^\?/, '');

  return `${protocol}://${userInfo}${hosts}/${database}${query ? `?${query}` : ''}`;
}
