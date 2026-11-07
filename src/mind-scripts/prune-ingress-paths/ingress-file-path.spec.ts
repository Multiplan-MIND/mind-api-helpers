/**
 * Testes executados:
 * - resolveIngressFilePath
 *   - devolve o caminho real do .yml ou do .yaml dentro do diretório de trabalho
 *   - aceita o link simbólico para um YAML dentro do diretório de trabalho
 *   - recusa: sem o arquivo
 *   - recusa: com argumento a mais
 *   - recusa: com arquivo fora do diretório de trabalho
 *   - recusa: com extensão que não é de YAML
 *   - recusa: com arquivo inexistente
 *   - recusa: com link simbólico para fora do diretório de trabalho
 *   - recusa: com link simbólico .yml para um arquivo que não é YAML
 */

import { mkdirSync, mkdtempSync, realpathSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { resolveIngressFilePath } from './ingress-file-path';

/** Configuração */
let rootDirectory: string;
let workingDirectory: string;

beforeEach(() => {
  rootDirectory = realpathSync(mkdtempSync(join(tmpdir(), 'mind-ingress-file-path-')));
  workingDirectory = join(rootDirectory, 'service');
  mkdirSync(workingDirectory);
  writeFileSync(join(rootDirectory, 'outside.yml'), '');
  writeFileSync(join(workingDirectory, 'ingress.yml'), '');
  writeFileSync(join(workingDirectory, 'ingress.yaml'), '');
  writeFileSync(join(workingDirectory, 'notes.txt'), '');
});

afterEach(() => rmSync(rootDirectory, { recursive: true, force: true }));

/** Factories/helpers */
function linkInWorkingDirectory(linkName: string, target: string): void {
  symlinkSync(target, join(workingDirectory, linkName));
}

function resolvePath(...commandArguments: string[]): string {
  return resolveIngressFilePath(commandArguments, workingDirectory);
}

/** Testes */
describe('resolveIngressFilePath', () => {
  it('devolve o caminho real do .yml ou do .yaml dentro do diretório de trabalho', () => {
    expect(resolvePath('ingress.yml')).toBe(join(workingDirectory, 'ingress.yml'));
    expect(resolvePath('./ingress.yaml')).toBe(join(workingDirectory, 'ingress.yaml'));
  });

  it('aceita o link simbólico para um YAML dentro do diretório de trabalho', () => {
    linkInWorkingDirectory('link.yml', join(workingDirectory, 'ingress.yaml'));

    expect(resolvePath('link.yml')).toBe(join(workingDirectory, 'ingress.yaml'));
  });

  it.each([
    { reason: 'sem o arquivo', args: [], message: 'Usage: mind-prune-ingress-paths' },
    { reason: 'com argumento a mais', args: ['ingress.yml', 'ingress.yaml'], message: 'Usage:' },
    { reason: 'com arquivo fora do diretório de trabalho', args: ['../outside.yml'], message: 'must be inside' },
    { reason: 'com extensão que não é de YAML', args: ['notes.txt'], message: 'must be .yml or .yaml' },
    { reason: 'com arquivo inexistente', args: ['missing.yml'], message: 'File not found: missing.yml' },
  ])('recusa: $reason', ({ args, message }) => {
    expect(() => resolvePath(...args)).toThrow(message);
  });

  it('recusa: com link simbólico para fora do diretório de trabalho', () => {
    linkInWorkingDirectory('link.yml', join(rootDirectory, 'outside.yml'));

    expect(() => resolvePath('link.yml')).toThrow('must be inside');
  });

  it('recusa: com link simbólico .yml para um arquivo que não é YAML', () => {
    linkInWorkingDirectory('link.yml', join(workingDirectory, 'notes.txt'));

    expect(() => resolvePath('link.yml')).toThrow('must be .yml or .yaml');
  });
});
