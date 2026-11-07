/**
 * Testes executados:
 * - evaluateCoverage
 *   - sem o baseline
 *     - aprova o PR no mínimo
 *     - reprova o PR abaixo do mínimo
 *   - com o baseline abaixo do mínimo
 *     - aprova o PR que não regride em relação ao baseline, mesmo abaixo do mínimo
 *     - reprova o PR que regride em relação ao baseline
 *   - com o baseline no mínimo ou acima
 *     - aprova o PR que cai até o mínimo
 *     - reprova o PR abaixo do mínimo
 *   - com várias métricas
 *     - avalia cada métrica com o próprio mínimo e reprova quando qualquer uma reprova
 *     - não avalia a métrica sem mínimo
 *     - compara só com o mínimo a métrica que falta no baseline
 */

import { evaluateCoverage } from './coverage-evaluation';

/** Configuração */
beforeEach(() => {
  jest.spyOn(console, 'log').mockImplementation(() => undefined);
  jest.spyOn(console, 'error').mockImplementation(() => undefined);
});

afterEach(() => jest.restoreAllMocks());

/** Fixtures */
const LINES_90 = { lines: 90 };

/** Testes */
describe('evaluateCoverage', () => {
  describe('sem o baseline', () => {
    it('aprova o PR no mínimo', () => {
      expect(evaluateCoverage(LINES_90, { lines: 90 })).toBe(true);
    });

    it('reprova o PR abaixo do mínimo', () => {
      expect(evaluateCoverage(LINES_90, { lines: 89.99 })).toBe(false);
      expect(console.error).toHaveBeenCalledWith('lines     : PR 89.99% | minimum 90.00% | failed: below the minimum');
    });
  });

  describe('com o baseline abaixo do mínimo', () => {
    it('aprova o PR que não regride em relação ao baseline, mesmo abaixo do mínimo', () => {
      expect(evaluateCoverage(LINES_90, { lines: 80 }, { lines: 80 })).toBe(true);
      expect(evaluateCoverage(LINES_90, { lines: 85 }, { lines: 80 })).toBe(true);
    });

    it('reprova o PR que regride em relação ao baseline', () => {
      expect(evaluateCoverage(LINES_90, { lines: 79.5 }, { lines: 80 })).toBe(false);
      expect(console.error).toHaveBeenCalledWith(
        'lines     : PR 79.50% (-0.50%) | baseline 80.00% | floor 80.00% | failed: regression against baseline',
      );
    });
  });

  describe('com o baseline no mínimo ou acima', () => {
    it('aprova o PR que cai até o mínimo', () => {
      expect(evaluateCoverage(LINES_90, { lines: 90 }, { lines: 95 })).toBe(true);
      expect(console.log).toHaveBeenCalledWith(
        'lines     : PR 90.00% (-5.00%) | baseline 95.00% | floor 90.00% | passed',
      );
    });

    it('reprova o PR abaixo do mínimo', () => {
      expect(evaluateCoverage(LINES_90, { lines: 89.99 }, { lines: 95 })).toBe(false);
      expect(console.error).toHaveBeenCalledWith(
        'lines     : PR 89.99% (-5.01%) | baseline 95.00% | floor 90.00% | failed: below the minimum',
      );
    });
  });

  describe('com várias métricas', () => {
    it('avalia cada métrica com o próprio mínimo e reprova quando qualquer uma reprova', () => {
      const approved = evaluateCoverage({ lines: 90, functions: 80 }, { lines: 95, functions: 79 });

      expect(approved).toBe(false);
      expect(console.log).toHaveBeenCalledWith('lines     : PR 95.00% | minimum 90.00% | passed');
      expect(console.error).toHaveBeenCalledWith('functions : PR 79.00% | minimum 80.00% | failed: below the minimum');
    });

    it('não avalia a métrica sem mínimo', () => {
      expect(evaluateCoverage({ functions: 80 }, { lines: 10, functions: 85 })).toBe(true);
      expect(console.log).not.toHaveBeenCalledWith(expect.stringContaining('lines'));
    });

    it('compara só com o mínimo a métrica que falta no baseline', () => {
      const approved = evaluateCoverage({ lines: 90, functions: 80 }, { lines: 92, functions: 81 }, { lines: 93 });

      expect(approved).toBe(true);
      expect(console.log).toHaveBeenCalledWith(
        'Warning: baseline summary has no functions, checking it only against the minimum',
      );
      expect(console.log).toHaveBeenCalledWith('functions : PR 81.00% | minimum 80.00% | passed');
    });
  });
});
