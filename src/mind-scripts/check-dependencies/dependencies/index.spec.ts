/**
 * Testes executados:
 * - DEPENDENCY_TYPES
 *   - registra os tipos na ordem em que a mensagem de erro os lista
 *   - não deixa tipo declarar campo com o nome de uma chave que o núcleo lê
 */

import { DEPENDENCY_TYPES } from '.';

/** Fixtures */
const RESERVED_KEYS = ['type', 'enabled'];

/** Testes */
describe('DEPENDENCY_TYPES', () => {
  it('registra os tipos na ordem em que a mensagem de erro os lista', () => {
    expect(Object.keys(DEPENDENCY_TYPES)).toEqual(['mongodb', 'redis', 'rabbitmq', 'http']);
  });

  it('não deixa tipo declarar campo com o nome de uma chave que o núcleo lê', () => {
    for (const definition of Object.values(DEPENDENCY_TYPES)) {
      expect(Object.keys(definition.fields).filter((name) => RESERVED_KEYS.includes(name))).toEqual([]);
    }
  });
});
