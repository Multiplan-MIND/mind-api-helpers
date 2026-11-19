/**
 * Testes executados:
 * - pruneIngressPaths
 *   - devolve 0 sem reescrever o arquivo que não tem caminho inválido
 *   - remove os caminhos inválidos de todos os documentos e mantém o separador entre eles
 *   - avisa no log quando o Ingress fica sem regra nenhuma
 *   - devolve 0 com o arquivo vazio
 *   - devolve 1 sem mexer no arquivo quando o YAML não faz parse
 *   - devolve 1 quando o argumento é recusado
 */

import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { pruneIngressPaths } from './prune-ingress-paths';

/** Configuração */
let workingDirectory: string;

beforeEach(() => {
  workingDirectory = mkdtempSync(join(tmpdir(), 'mind-prune-ingress-paths-'));
  jest.spyOn(console, 'log').mockImplementation(() => undefined);
  jest.spyOn(console, 'error').mockImplementation(() => undefined);
});

afterEach(() => {
  rmSync(workingDirectory, { recursive: true, force: true });
  jest.restoreAllMocks();
});

/** Fixtures */
const LONG_SERVICE = `concierge-${'a'.repeat(54)}`;

/** Factories/helpers */
function ingressYaml(name: string, ...serviceNames: string[]): string {
  const header = [
    'apiVersion: networking.k8s.io/v1',
    'kind: Ingress',
    'metadata:',
    `  name: ${name} # ingress compartilhado`,
    'spec:',
    '  rules:',
    '    - http:',
    '        paths:',
  ];
  const paths = serviceNames.flatMap((serviceName) => [
    `          - path: /${serviceName}`,
    '            pathType: Prefix',
    '            backend:',
    '              service:',
    `                name: ${serviceName}`,
    '                port:',
    '                  number: 80',
  ]);

  return `${[...header, ...paths].join('\n')}\n`;
}

function writeIngressFile(content: string): void {
  writeFileSync(join(workingDirectory, 'ingress.yml'), content);
}

function readIngressFile(): string {
  return readFileSync(join(workingDirectory, 'ingress.yml'), 'utf8');
}

function runPrune(...commandArguments: string[]): number {
  return pruneIngressPaths(commandArguments, workingDirectory);
}

/** Testes */
describe('pruneIngressPaths', () => {
  it('devolve 0 sem reescrever o arquivo que não tem caminho inválido', () => {
    const content = `${ingressYaml('mind-api', 'concierge-develop')}\n\n# fim\n`;
    writeIngressFile(content);

    expect(runPrune('ingress.yml')).toBe(0);
    expect(readIngressFile()).toBe(content);
    expect(console.log).toHaveBeenCalledWith(expect.stringContaining('No invalid paths in'));
  });

  it('remove os caminhos inválidos de todos os documentos e mantém o separador entre eles', () => {
    writeIngressFile(
      `${ingressYaml('first', 'concierge-develop', LONG_SERVICE)}---\n${ingressYaml(
        'second',
        LONG_SERVICE,
        'concierge-main',
      )}`,
    );

    expect(runPrune('ingress.yml')).toBe(0);
    expect(readIngressFile()).toBe(
      `${ingressYaml('first', 'concierge-develop')}---\n${ingressYaml('second', 'concierge-main')}`,
    );
    expect(console.log).toHaveBeenCalledWith(`Removed: path=/${LONG_SERVICE} service=${LONG_SERVICE} (64 characters)`);
    expect(console.log).toHaveBeenCalledWith(expect.stringContaining('2 path(s) removed from'));
    expect(console.log).not.toHaveBeenCalledWith(expect.stringContaining('Warning:'));
  });

  it('avisa no log quando o Ingress fica sem regra nenhuma', () => {
    writeIngressFile(ingressYaml('mind-api', LONG_SERVICE));

    expect(runPrune('ingress.yml')).toBe(0);
    expect(console.log).toHaveBeenCalledWith(
      'Warning: ingress mind-api has no rules left and no defaultBackend, so the cluster will reject it',
    );
  });

  it('devolve 0 com o arquivo vazio', () => {
    writeIngressFile('');

    expect(runPrune('ingress.yml')).toBe(0);
    expect(readIngressFile()).toBe('');
  });

  it('devolve 1 sem mexer no arquivo quando o YAML não faz parse', () => {
    const content = `${ingressYaml('mind-api', LONG_SERVICE)}  bad: [\n`;
    writeIngressFile(content);

    expect(runPrune('ingress.yml')).toBe(1);
    expect(readIngressFile()).toBe(content);
    expect(console.error).toHaveBeenCalledWith(expect.stringContaining('is not valid YAML'));
  });

  it('devolve 1 quando o argumento é recusado', () => {
    expect(runPrune()).toBe(1);
    expect(console.error).toHaveBeenCalledWith('Usage: mind-prune-ingress-paths <ingress.yml>');
  });
});
