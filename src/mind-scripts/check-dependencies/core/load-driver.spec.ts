/**
 * Testes executados:
 * - loadDriver
 *   - devolve o módulo carregado
 *   - diz qual pacote falta quando ele não está instalado
 *   - repassa o erro que não é de módulo ausente
 */

import { loadDriver } from './load-driver';

/** Testes */
describe('loadDriver', () => {
  it('devolve o módulo carregado', async () => {
    await expect(loadDriver('driver', () => Promise.resolve({ connect: 'ok' }))).resolves.toEqual({ connect: 'ok' });
  });

  it('diz qual pacote falta quando ele não está instalado', async () => {
    const missing = Object.assign(new Error("Cannot find module 'amqplib'"), { code: 'MODULE_NOT_FOUND' });

    await expect(loadDriver('amqplib', () => Promise.reject(missing))).rejects.toThrow(
      'The amqplib package is not installed in the service',
    );
  });

  it('repassa o erro que não é de módulo ausente', async () => {
    const failure = new Error('syntax error in driver');

    await expect(loadDriver('amqplib', () => Promise.reject(failure))).rejects.toBe(failure);
  });
});
