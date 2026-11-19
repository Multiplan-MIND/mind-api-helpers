import { randomUUID } from 'node:crypto';

import { CHECK_TIMEOUT_MILLISECONDS, SettingsOf, defineDependency, field, loadDriver } from '../../core';

/** Os padrões são as variáveis que os serviços MIND já usam, então o serviço que as segue declara só o tipo. */
const fields = {
  host: field.text({ default: '${REDIS_HOST}' }),
  port: field.port({ default: '${REDIS_PORT:-6379}' }),
  keyPrefix: field.text({ default: '${REDIS_PREFIX:-}' }),
};

export type RedisSettings = SettingsOf<typeof fields>;

/**
 * Grava e remove uma chave sob o prefixo, porque a aplicação escreve; o TTL a apaga se o processo morrer no meio. A
 * remoção que não acha a chave prova que a gravação não ficou.
 */
async function checkRedis(settings: RedisSettings): Promise<void> {
  const { Redis } = await loadDriver('ioredis', () => import('ioredis'));
  const client = new Redis({
    host: settings.host,
    port: settings.port,
    keyPrefix: settings.keyPrefix,
    lazyConnect: true,
    connectTimeout: CHECK_TIMEOUT_MILLISECONDS,
    commandTimeout: CHECK_TIMEOUT_MILLISECONDS,
    enableOfflineQueue: false,
    maxRetriesPerRequest: 0,
    retryStrategy: (): null => null,
  });
  /** Sem retentativa, o connect rejeita só com "Connection is closed", e o motivo real chega antes por este evento. */
  let connectionError: unknown;
  client.on('error', (error: unknown) => {
    connectionError = error;
  });
  try {
    await client.connect().catch((error: unknown) => {
      throw connectionError ?? error;
    });
    const probeKey = `dependency-check:${randomUUID()}`;
    await client.set(probeKey, 'ok', 'EX', 60);
    if ((await client.del(probeKey)) !== 1) throw new Error('Redis did not keep the key just written');
  } finally {
    client.disconnect();
  }
}

export const redis = defineDependency({ fields, check: checkRedis });
