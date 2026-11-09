import { CHECK_TIMEOUT_MILLISECONDS, SettingsOf, defineDependency, field, loadDriver } from '../../core';
import { buildAmqpUri } from './amqp-uri';

/** Os padrões são as variáveis que os serviços MIND já usam, então o serviço que as segue declara só o tipo. */
const fields = {
  protocol: field.text({ default: '${AMQP_PROTOCOL:-amqp}' }),
  user: field.text({ default: '${AMQP_USER}', secret: true }),
  password: field.text({ default: '${AMQP_PASS}', secret: true }),
  host: field.text({ default: '${AMQP_URL}' }),
  port: field.port({ default: '${AMQP_PORT:-5672}' }),
  vhost: field.text({ default: '${AMQP_VHOST}' }),
  exchanges: field.textList(),
};

export type RabbitmqSettings = SettingsOf<typeof fields>;

function ignoreError(): void {
  /** Um evento `error` sem ouvinte derruba o processo; a falha real já chega pela promessa rejeitada. */
}

/** Verificação passiva: confirma que os exchanges existem sem declarar nada, porque quem os cria é quem publica. */
async function checkRabbitmq(settings: RabbitmqSettings): Promise<void> {
  const { connect } = await loadDriver('amqplib', () => import('amqplib'));
  const connection = await connect(buildAmqpUri(settings), { timeout: CHECK_TIMEOUT_MILLISECONDS });
  connection.on('error', ignoreError);
  try {
    const channel = await connection.createChannel();
    channel.on('error', ignoreError);
    for (const exchange of settings.exchanges) await channel.checkExchange(exchange);
  } finally {
    await connection.close().catch(ignoreError);
  }
}

export const rabbitmq = defineDependency({ fields, check: checkRabbitmq });
