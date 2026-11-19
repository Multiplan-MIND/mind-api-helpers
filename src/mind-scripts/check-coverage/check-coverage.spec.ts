/**
 * Testes executados:
 * - checkCoverage
 *   - devolve 1 e mostra o uso quando falta o summary do PR
 *   - devolve 1 quando o summary do PR não existe
 *   - devolve 1 quando o summary não tem percentual numérico numa métrica com mínimo
 *   - devolve 0 quando a cobertura é aprovada
 *   - compara com o baseline quando o summary dele existe
 *   - verifica só os mínimos quando o summary do baseline não existe
 *   - compara só com o mínimo a métrica que o summary do baseline não tem
 *   - aplica os mínimos do coverageThreshold.json
 *   - devolve 1 na reprovação a partir da versão 1.0
 *   - devolve 0 e avisa na reprovação abaixo da versão 1.0
 *   - devolve 1 na reprovação abaixo da versão 1.0 com --enforce-before-v1
 *   - devolve 1 na reprovação quando o package.json não tem versão válida
 */

import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { checkCoverage } from './check-coverage';

/** Configuração */
let projectDirectory: string;

beforeEach(() => {
  projectDirectory = mkdtempSync(join(tmpdir(), 'mind-check-coverage-'));
  jest.spyOn(console, 'log').mockImplementation(() => undefined);
  jest.spyOn(console, 'error').mockImplementation(() => undefined);
});

afterEach(() => {
  rmSync(projectDirectory, { recursive: true, force: true });
  jest.restoreAllMocks();
});

/** Factories/helpers */
function writeSummary(file: string, lines: number | string, branches: number = lines as number): string {
  const metric = (pct: number | string) => ({ total: 100, covered: 0, skipped: 0, pct });
  writeFileSync(
    join(projectDirectory, file),
    JSON.stringify({ total: { lines: metric(lines), branches: metric(branches) } }),
  );
  return file;
}

function writeProjectJson(file: string, content: object): void {
  writeFileSync(join(projectDirectory, file), JSON.stringify(content));
}

function runCheck(...commandArguments: string[]): number {
  return checkCoverage(commandArguments, projectDirectory);
}

/** Testes */
describe('checkCoverage', () => {
  it('devolve 1 e mostra o uso quando falta o summary do PR', () => {
    expect(runCheck('--enforce-before-v1')).toBe(1);
    expect(console.error).toHaveBeenCalledWith(expect.stringContaining('Usage: mind-check-coverage'));
  });

  it('devolve 1 quando o summary do PR não existe', () => {
    expect(runCheck('missing.json')).toBe(1);
    expect(console.error).toHaveBeenCalledWith(`File not found: ${join(projectDirectory, 'missing.json')}`);
  });

  it('devolve 1 quando o summary não tem percentual numérico numa métrica com mínimo', () => {
    writeProjectJson('package.json', { version: '0.1.0' });

    expect(runCheck(writeSummary('pr.json', 'Unknown'))).toBe(1);
    expect(console.error).toHaveBeenCalledWith(expect.stringContaining('has no numeric total.lines.pct'));
  });

  it('devolve 0 quando a cobertura é aprovada', () => {
    writeProjectJson('package.json', { version: '1.0.0' });

    expect(runCheck(writeSummary('pr.json', 95))).toBe(0);
  });

  it('compara com o baseline quando o summary dele existe', () => {
    writeProjectJson('package.json', { version: '1.0.0' });

    expect(runCheck(writeSummary('pr.json', 85), writeSummary('baseline.json', 80))).toBe(0);
    expect(console.log).toHaveBeenCalledWith(expect.stringContaining('baseline 80.00% | floor 80.00% | passed'));
  });

  it('verifica só os mínimos quando o summary do baseline não existe', () => {
    writeProjectJson('package.json', { version: '1.0.0' });

    expect(runCheck(writeSummary('pr.json', 75), 'baseline.json')).toBe(1);
    expect(console.log).toHaveBeenCalledWith('Warning: baseline summary not found, checking only the minimums');
  });

  it('compara só com o mínimo a métrica que o summary do baseline não tem', () => {
    writeProjectJson('package.json', { version: '1.0.0' });
    writeProjectJson('baseline.json', { total: { lines: { pct: 93 } } });

    expect(runCheck('--branches=80', writeSummary('pr.json', 85, 81), 'baseline.json')).toBe(0);
    expect(console.log).toHaveBeenCalledWith(
      'Warning: baseline summary has no branches, checking it only against the minimum',
    );
  });

  it('aplica os mínimos do coverageThreshold.json', () => {
    writeProjectJson('package.json', { version: '1.0.0' });
    writeProjectJson('coverageThreshold.json', { lines: 80, branches: 70 });

    expect(runCheck(writeSummary('pr.json', 85, 75))).toBe(0);
    expect(runCheck(writeSummary('pr.json', 85, 65))).toBe(1);
  });

  it('devolve 1 na reprovação a partir da versão 1.0', () => {
    writeProjectJson('package.json', { version: '1.2.3' });

    expect(runCheck(writeSummary('pr.json', 50))).toBe(1);
  });

  it('devolve 0 e avisa na reprovação abaixo da versão 1.0', () => {
    writeProjectJson('package.json', { version: '0.8.0' });

    expect(runCheck(writeSummary('pr.json', 50))).toBe(0);
    expect(console.log).toHaveBeenCalledWith(expect.stringContaining('Warning: version 0.8.0 is below 1.0'));
  });

  it('devolve 1 na reprovação abaixo da versão 1.0 com --enforce-before-v1', () => {
    writeProjectJson('package.json', { version: '0.8.0' });

    expect(runCheck('--enforce-before-v1', writeSummary('pr.json', 50))).toBe(1);
  });

  it('devolve 1 na reprovação quando o package.json não tem versão válida', () => {
    writeProjectJson('package.json', { version: 'next' });

    expect(runCheck(writeSummary('pr.json', 50))).toBe(1);
  });
});
