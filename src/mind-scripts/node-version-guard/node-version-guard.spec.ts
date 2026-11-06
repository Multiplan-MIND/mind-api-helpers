/**
 * Testes executados:
 * - node-version-guard
 *   - encerra o processo quando a versão em execução fica abaixo da faixa do engines.node
 *   - encerra o processo quando a versão em execução é de uma major acima da faixa
 *   - deixa a aplicação seguir quando a versão em execução está na faixa
 *   - nomeia a faixa exigida, a versão em execução, o executável e o package.json de onde a faixa veio
 *   - lê a faixa do package.json mais próximo, subindo a partir do diretório atual
 *   - encerra o processo quando nenhum package.json é encontrado
 *   - encerra o processo quando o package.json não tem uma faixa válida no engines.node
 */

import { existsSync, readFileSync, writeSync } from 'node:fs';
import { join } from 'node:path';

/**
 * O guard roda na importação e sua única saída é escrever no descritor de erro e encerrar. Testá-lo é carregá-lo de
 * novo com uma versão de Node fingida e um sistema de arquivos em memória.
 */

/** Configuração */
jest.mock('node:fs', () => ({ existsSync: jest.fn(), readFileSync: jest.fn(), writeSync: jest.fn() }));

/** Fixtures */
const STDERR_FILE_DESCRIPTOR = 2;
const PROJECT_DIRECTORY = '/srv/mind-api-service';
const PROJECT_PACKAGE_FILE = join(PROJECT_DIRECTORY, 'package.json');
const ENGINES_NODE_RANGE = '>=24.22 <25';
const NODE_EXECUTABLE = '/usr/local/bin/node';

/**
 * Factories/helpers: `process.version` e `process.versions` são somente leitura, então a troca é feita pelo
 * descritor da propriedade e desfeita ao fim de cada caso.
 */
const PROCESS_PROPERTIES_TO_RESTORE = ['version', 'versions', 'execPath'] as const;
const originalProcessDescriptors = new Map(
  PROCESS_PROPERTIES_TO_RESTORE.map((property) => [property, Object.getOwnPropertyDescriptor(process, property)]),
);

let virtualFiles: Map<string, string>;

function overrideProcessProperty(property: string, value: unknown): void {
  Object.defineProperty(process, property, { value, configurable: true, writable: true });
}

function restoreProcessProperties(): void {
  for (const [property, descriptor] of originalProcessDescriptors)
    if (descriptor) Object.defineProperty(process, property, descriptor);
}

function packageWithEngines(engines: unknown): string {
  return JSON.stringify({ name: 'mind-api-service', engines });
}

function runGuard(nodeVersion: string, currentDirectory = PROJECT_DIRECTORY) {
  let exitCode: number | undefined;

  jest.spyOn(process, 'exit').mockImplementation(((code?: number) => {
    exitCode = code;
    return undefined as never;
  }) as typeof process.exit);
  jest.spyOn(process, 'cwd').mockReturnValue(currentDirectory);
  overrideProcessProperty('version', `v${nodeVersion}`);
  overrideProcessProperty('versions', { ...process.versions, node: nodeVersion });
  overrideProcessProperty('execPath', NODE_EXECUTABLE);

  jest.isolateModules(() => {
    /** O guard age na importação, e só o require síncrono roda dentro do registro isolado do Jest. */
    require('./node-version-guard');
  });

  const message = (writeSync as jest.Mock).mock.calls
    .filter(([fileDescriptor]) => fileDescriptor === STDERR_FILE_DESCRIPTOR)
    .map(([, text]) => String(text))
    .join('');

  return { exitCode, message };
}

/** Testes */
describe('node-version-guard', () => {
  beforeEach(() => {
    virtualFiles = new Map([[PROJECT_PACKAGE_FILE, packageWithEngines({ node: ENGINES_NODE_RANGE })]]);
    (existsSync as jest.Mock).mockImplementation((path: string) => virtualFiles.has(path));
    (readFileSync as jest.Mock).mockImplementation((path: string) => {
      if (!virtualFiles.has(path)) throw Object.assign(new Error(`ENOENT: ${path}`), { code: 'ENOENT' });
      return virtualFiles.get(path);
    });
  });

  afterEach(() => {
    jest.restoreAllMocks();
    restoreProcessProperties();
    (writeSync as jest.Mock).mockClear();
  });

  /** A 22.12 já tem `require(esm)`, mas fica fora da faixa do `engines.node`, que é a única aceita. */
  it.each(['20.11.0', '22.12.0', '24.21.9'])(
    'encerra o processo quando a versão em execução fica abaixo da faixa do engines.node (%s)',
    (nodeVersion) => {
      expect(runGuard(nodeVersion).exitCode).toBe(1);
    },
  );

  it('encerra o processo quando a versão em execução é de uma major acima da faixa', () => {
    expect(runGuard('25.0.0').exitCode).toBe(1);
  });

  it.each(['24.22.0', '24.25.1'])(
    'deixa a aplicação seguir quando a versão em execução está na faixa (%s)',
    (nodeVersion) => {
      const { exitCode, message } = runGuard(nodeVersion);

      expect(exitCode).toBeUndefined();
      expect(message).toBe('');
    },
  );

  /** O erro que o guard substitui não cita versão nenhuma, então nomeá-las é o ponto da mensagem. */
  it('nomeia a faixa exigida, a versão em execução, o executável e o package.json de onde a faixa veio', () => {
    const { message } = runGuard('22.12.0');

    expect(message).toContain(`requires Node ${ENGINES_NODE_RANGE}`);
    expect(message).toContain('v22.12.0');
    expect(message).toContain(NODE_EXECUTABLE);
    expect(message).toContain(PROJECT_PACKAGE_FILE);
    expect(message).toContain('.nvmrc');
    expect(message).toContain('Dockerfile');
  });

  it('lê a faixa do package.json mais próximo, subindo a partir do diretório atual', () => {
    const { exitCode, message } = runGuard('22.12.0', join(PROJECT_DIRECTORY, 'dist', 'src'));

    expect(exitCode).toBe(1);
    expect(message).toContain(PROJECT_PACKAGE_FILE);
  });

  it('encerra o processo quando nenhum package.json é encontrado', () => {
    virtualFiles.clear();

    const { exitCode, message } = runGuard('24.22.0');

    expect(exitCode).toBe(1);
    expect(message).toContain(`No package.json found from ${PROJECT_DIRECTORY} upwards`);
  });

  it.each([
    ['sem engines', JSON.stringify({ name: 'mind-api-service' })],
    ['sem engines.node', packageWithEngines({ npm: '>=10' })],
    ['com faixa inválida', packageWithEngines({ node: 'vinte e quatro' })],
    ['com JSON inválido', '{ "engines": '],
  ])('encerra o processo quando o package.json não tem uma faixa válida no engines.node (%s)', (_case, content) => {
    virtualFiles.set(PROJECT_PACKAGE_FILE, content);

    const { exitCode, message } = runGuard('24.22.0');

    expect(exitCode).toBe(1);
    expect(message).toContain(`${PROJECT_PACKAGE_FILE} has no valid engines.node range`);
  });
});
