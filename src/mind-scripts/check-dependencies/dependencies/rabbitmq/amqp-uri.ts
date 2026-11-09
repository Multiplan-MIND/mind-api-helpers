import type { RabbitmqSettings } from '.';

/** O usuário, a senha e o vhost são codificados, então o vhost padrão é escrito como `/` mesmo. */
export function buildAmqpUri({ protocol, user, password, host, port, vhost }: RabbitmqSettings): string {
  const userInfo = `${encodeURIComponent(user)}:${encodeURIComponent(password)}`;

  return `${protocol}://${userInfo}@${host}:${port}/${encodeURIComponent(vhost)}`;
}
