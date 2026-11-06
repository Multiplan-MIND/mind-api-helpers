/**
 * Testes executados:
 * - checkCoverage
 *   - devolve 1 e mostra o uso quando falta o summary do PR
 *   - devolve 1 quando o summary do PR não existe
 *   - devolve 1 quando o summary não tem percentual numérico de linhas
 *   - devolve 0 quando a cobertura é aprovada
 *   - compara com o develop quando o summary dele existe
 *   - verifica só o mínimo quando o summary do develop não existe
 *   - devolve 1 na reprovação a partir da versão 1.0
 *   - devolve 0 e avisa na reprovação abaixo da versão 1.0
 *   - devolve 1 na reprovação abaixo da versão 1.0 com --enforce-before-v1, em qualquer posição
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
function writeSummary(file: string, pct: number | string): string {
  const filePath = join(projectDirectory, file);
  writeFileSync(filePath, JSON.stringify({ total: { lines: { total: 100, covered: 0, skipped: 0, pct } } }));
  return filePath;
}

function writePackage(content: object): void {
  writeFileSync(join(projectDirectory, 'package.json'), JSON.stringify(content));
}

/** Testes */
describe('checkCoverage', () => {
  it('devolve 1 e mostra o uso quando falta o summary do PR', () => {
    expect(checkCoverage(['--enforce-before-v1'], projectDirectory)).toBe(1);
    expect(console.error).toHaveBeenCalledWith(expect.stringContaining('Usage: mind-check-coverage'));
  });

  it('devolve 1 quando o summary do PR não existe', () => {
    const missingPath = join(projectDirectory, 'missing.json');

    expect(checkCoverage([missingPath], projectDirectory)).toBe(1);
    expect(console.error).toHaveBeenCalledWith(`File not found: ${missingPath}`);
  });

  it('devolve 1 quando o summary não tem percentual numérico de linhas', () => {
    writePackage({ version: '0.1.0' });

    expect(checkCoverage([writeSummary('pr.json', 'Unknown')], projectDirectory)).toBe(1);
    expect(console.error).toHaveBeenCalledWith(expect.stringContaining('has no numeric total.lines.pct'));
  });

  it('devolve 0 quando a cobertura é aprovada', () => {
    writePackage({ version: '1.0.0' });

    expect(checkCoverage([writeSummary('pr.json', 95)], projectDirectory)).toBe(0);
  });

  it('compara com o develop quando o summary dele existe', () => {
    writePackage({ version: '1.0.0' });

    expect(checkCoverage([writeSummary('pr.json', 85), writeSummary('develop.json', 80)], projectDirectory)).toBe(0);
    expect(console.log).toHaveBeenCalledWith('develop coverage: 80.00% (lines)');
  });

  it('verifica só o mínimo quando o summary do develop não existe', () => {
    writePackage({ version: '1.0.0' });

    const exitCode = checkCoverage(
      [writeSummary('pr.json', 85), join(projectDirectory, 'develop.json')],
      projectDirectory,
    );

    expect(exitCode).toBe(1);
    expect(console.log).toHaveBeenCalledWith('Warning: develop summary not found, checking only the absolute minimum');
  });

  it('devolve 1 na reprovação a partir da versão 1.0', () => {
    writePackage({ version: '1.2.3' });

    expect(checkCoverage([writeSummary('pr.json', 50)], projectDirectory)).toBe(1);
  });

  it('devolve 0 e avisa na reprovação abaixo da versão 1.0', () => {
    writePackage({ version: '0.8.0' });

    expect(checkCoverage([writeSummary('pr.json', 50)], projectDirectory)).toBe(0);
    expect(console.log).toHaveBeenCalledWith(expect.stringContaining('Warning: version 0.8.0 is below 1.0'));
  });

  it('devolve 1 na reprovação abaixo da versão 1.0 com --enforce-before-v1, em qualquer posição', () => {
    writePackage({ version: '0.8.0' });
    const prSummaryPath = writeSummary('pr.json', 50);

    expect(checkCoverage(['--enforce-before-v1', prSummaryPath], projectDirectory)).toBe(1);
    expect(checkCoverage([prSummaryPath, '--enforce-before-v1'], projectDirectory)).toBe(1);
  });

  it('devolve 1 na reprovação quando o package.json não tem versão válida', () => {
    writePackage({ version: 'next' });

    expect(checkCoverage([writeSummary('pr.json', 50)], projectDirectory)).toBe(1);
  });
});
