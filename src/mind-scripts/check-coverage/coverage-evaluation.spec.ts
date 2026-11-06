/**
 * Testes executados:
 * - evaluateCoverage
 *   - sem o develop
 *     - aprova o PR no mínimo
 *     - reprova o PR abaixo do mínimo
 *   - com o develop abaixo do mínimo
 *     - aprova o PR que não regride em relação ao develop, mesmo abaixo do mínimo
 *     - reprova o PR que regride em relação ao develop
 *   - com o develop no mínimo ou acima
 *     - aprova o PR que cai até o mínimo
 *     - reprova o PR abaixo do mínimo
 */

import { evaluateCoverage } from './coverage-evaluation';

/** Configuração */
beforeEach(() => {
  jest.spyOn(console, 'log').mockImplementation(() => undefined);
  jest.spyOn(console, 'error').mockImplementation(() => undefined);
});

afterEach(() => jest.restoreAllMocks());

/** Testes */
describe('evaluateCoverage', () => {
  describe('sem o develop', () => {
    it('aprova o PR no mínimo', () => {
      expect(evaluateCoverage(90)).toBe(true);
    });

    it('reprova o PR abaixo do mínimo', () => {
      expect(evaluateCoverage(89.99)).toBe(false);
      expect(console.error).toHaveBeenCalledWith('Failed: below the minimum (89.99% < 90%)');
    });
  });

  describe('com o develop abaixo do mínimo', () => {
    it('aprova o PR que não regride em relação ao develop, mesmo abaixo do mínimo', () => {
      expect(evaluateCoverage(80, 80)).toBe(true);
      expect(evaluateCoverage(85, 80)).toBe(true);
    });

    it('reprova o PR que regride em relação ao develop', () => {
      expect(evaluateCoverage(79.5, 80)).toBe(false);
      expect(console.error).toHaveBeenCalledWith('Failed: regression against develop (79.50% < 80.00%)');
    });
  });

  describe('com o develop no mínimo ou acima', () => {
    it('aprova o PR que cai até o mínimo', () => {
      expect(evaluateCoverage(90, 95)).toBe(true);
      expect(console.log).toHaveBeenCalledWith('Passed (-5.00% vs develop, floor: 90.00%)');
    });

    it('reprova o PR abaixo do mínimo', () => {
      expect(evaluateCoverage(89.99, 95)).toBe(false);
      expect(console.error).toHaveBeenCalledWith('Failed: coverage fell below 90% (89.99% < 90%)');
    });
  });
});
