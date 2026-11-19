/**
 * Testes executados:
 * - resolveCoverageOptions
 *   - exige 80% de linhas e de branches quando nem o arquivo nem a linha de comando definem mínimo
 *   - lê os mínimos e o enforceBeforeV1 do coverageThreshold.json da raiz
 *   - lê o arquivo apontado pelo --config no lugar do da raiz
 *   - a flag de uma métrica vale sobre o arquivo só para ela
 *   - não liga o padrão quando alguma métrica é definida
 *   - aceita o --enforce-before-v1 em qualquer posição
 *   - resolve os caminhos dos summaries a partir do diretório do projeto
 *   - recusa: sem o summary do PR
 *   - recusa: com summary a mais
 *   - recusa: com opção desconhecida
 *   - recusa: com métrica sem valor
 *   - recusa: com mínimo vazio
 *   - recusa: com mínimo acima de 100
 *   - recusa: com mínimo negativo
 *   - recusa: com --config sem caminho
 *   - recusa: com --config inexistente
 *   - recusa: com JSON inválido
 *   - recusa: com arquivo que não é objeto
 *   - recusa: com chave desconhecida no arquivo
 *   - recusa: com mínimo em texto no arquivo
 *   - recusa: com enforceBeforeV1 que não é booleano
 */

import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { resolveCoverageOptions } from './coverage-options';

/** Configuração */
let projectDirectory: string;

beforeEach(() => {
  projectDirectory = mkdtempSync(join(tmpdir(), 'mind-coverage-options-'));
});

afterEach(() => rmSync(projectDirectory, { recursive: true, force: true }));

/** Factories/helpers */
function writeProjectFile(file: string, content: string): void {
  writeFileSync(join(projectDirectory, file), content);
}

function resolveOptions(...commandArguments: string[]) {
  return resolveCoverageOptions(commandArguments, projectDirectory);
}

/** Testes */
describe('resolveCoverageOptions', () => {
  it('exige 80% de linhas e de branches quando nem o arquivo nem a linha de comando definem mínimo', () => {
    expect(resolveOptions('pr.json')).toMatchObject({
      thresholds: { lines: 80, branches: 80 },
      enforceBeforeV1: false,
    });
  });

  it('lê os mínimos e o enforceBeforeV1 do coverageThreshold.json da raiz', () => {
    writeProjectFile('coverageThreshold.json', JSON.stringify({ lines: 85, functions: 80, enforceBeforeV1: true }));

    expect(resolveOptions('pr.json')).toMatchObject({
      thresholds: { lines: 85, functions: 80 },
      enforceBeforeV1: true,
    });
  });

  it('lê o arquivo apontado pelo --config no lugar do da raiz', () => {
    writeProjectFile('coverageThreshold.json', JSON.stringify({ lines: 85 }));
    writeProjectFile('ci-thresholds.json', JSON.stringify({ branches: 70 }));

    expect(resolveOptions('--config=ci-thresholds.json', 'pr.json').thresholds).toEqual({ branches: 70 });
  });

  it('a flag de uma métrica vale sobre o arquivo só para ela', () => {
    writeProjectFile('coverageThreshold.json', JSON.stringify({ lines: 85, functions: 80 }));

    expect(resolveOptions('--functions=75.5', 'pr.json').thresholds).toEqual({ lines: 85, functions: 75.5 });
  });

  it('não liga o padrão quando alguma métrica é definida', () => {
    expect(resolveOptions('--statements=60', 'pr.json').thresholds).toEqual({ statements: 60 });
  });

  it('aceita o --enforce-before-v1 em qualquer posição', () => {
    expect(resolveOptions('--enforce-before-v1', 'pr.json').enforceBeforeV1).toBe(true);
    expect(resolveOptions('pr.json', 'base.json', '--enforce-before-v1').enforceBeforeV1).toBe(true);
  });

  it('resolve os caminhos dos summaries a partir do diretório do projeto', () => {
    expect(resolveOptions('coverage/pr.json', 'base.json')).toMatchObject({
      prSummaryPath: join(projectDirectory, 'coverage/pr.json'),
      baselineSummaryPath: join(projectDirectory, 'base.json'),
    });
  });

  it.each([
    { reason: 'sem o summary do PR', files: {}, args: ['--lines=90'], message: 'Usage: mind-check-coverage' },
    { reason: 'com summary a mais', files: {}, args: ['a.json', 'b.json', 'c.json'], message: 'Usage:' },
    {
      reason: 'com opção desconhecida',
      files: {},
      args: ['--line=90', 'pr.json'],
      message: 'Unknown option: --line=90',
    },
    { reason: 'com métrica sem valor', files: {}, args: ['--lines', 'pr.json'], message: 'Unknown option: --lines' },
    { reason: 'com mínimo vazio', files: {}, args: ['--lines=', 'pr.json'], message: '--lines must be a percentage' },
    { reason: 'com mínimo acima de 100', files: {}, args: ['--lines=101', 'pr.json'], message: '--lines must be' },
    { reason: 'com mínimo negativo', files: {}, args: ['--branches=-10', 'pr.json'], message: '--branches must be' },
    { reason: 'com --config sem caminho', files: {}, args: ['--config=', 'pr.json'], message: '--config needs a file' },
    { reason: 'com --config inexistente', files: {}, args: ['--config=x.json', 'pr.json'], message: 'not found' },
    {
      reason: 'com JSON inválido',
      files: { 'coverageThreshold.json': '{ lines: 90 }' },
      args: ['pr.json'],
      message: 'Failed to read',
    },
    {
      reason: 'com arquivo que não é objeto',
      files: { 'coverageThreshold.json': '[90]' },
      args: ['pr.json'],
      message: 'must hold a JSON object',
    },
    {
      reason: 'com chave desconhecida no arquivo',
      files: { 'coverageThreshold.json': '{ "global": { "lines": 90 } }' },
      args: ['pr.json'],
      message: 'Unknown key "global"',
    },
    {
      reason: 'com mínimo em texto no arquivo',
      files: { 'coverageThreshold.json': '{ "lines": "90" }' },
      args: ['pr.json'],
      message: 'lines in',
    },
    {
      reason: 'com enforceBeforeV1 que não é booleano',
      files: { 'coverageThreshold.json': '{ "enforceBeforeV1": "yes" }' },
      args: ['pr.json'],
      message: 'enforceBeforeV1 in',
    },
  ])('recusa: $reason', ({ files, args, message }) => {
    Object.entries(files).forEach(([file, content]) => writeProjectFile(file, content));

    expect(() => resolveOptions(...args)).toThrow(message);
  });
});
