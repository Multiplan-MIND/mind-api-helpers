/**
 * Testes executados:
 * - checkDependencies
 *   - registra cada dependência e o resumo e devolve 0 quando todas respondem
 *   - devolve 1 na falha e mascara o segredo no erro registrado
 *   - mascara o segredo na mensagem sem apagar os caminhos da pilha
 *   - para na etapa environment quando falta variável, sem testar nenhuma dependência
 *   - registra como pulada a dependência desabilitada
 *   - completa o ambiente com o .env, sem sobrepor a variável do processo
 *   - lê o arquivo indicado por --config
 *   - recusa a opção desconhecida
 *   - registra a queda e devolve 1 quando o arquivo não existe
 */

import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { IncomingMessage, Server, ServerResponse, createServer } from 'node:http';
import { AddressInfo } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { MindLoggerService } from '../../mind-logger/mind-logger.service';
import { checkDependencies } from './check-dependencies';

/** Configuração */
let projectDirectory: string;
let server: Server;
let baseUrl: string;
let handler: (request: IncomingMessage, response: ServerResponse) => void;
let infoSpy: jest.SpyInstance;
let errorSpy: jest.SpyInstance;

beforeAll(async () => {
  server = createServer((request, response) => handler(request, response));
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});

afterAll(async () => {
  await new Promise((resolve) => server.close(resolve));
});

beforeEach(() => {
  projectDirectory = mkdtempSync(join(tmpdir(), 'mind-check-dependencies-'));
  /** Sem o setModule real, o logger não grava em logs/ e as linhas ficam só nos espiões. */
  jest.spyOn(MindLoggerService.prototype, 'setModule').mockImplementation(() => undefined);
  infoSpy = jest.spyOn(MindLoggerService.prototype, 'info').mockImplementation(() => undefined);
  errorSpy = jest.spyOn(MindLoggerService.prototype, 'error').mockImplementation(() => undefined);
  handler = (_request, response) => response.writeHead(200).end();
});

afterEach(() => {
  rmSync(projectDirectory, { recursive: true, force: true });
  jest.restoreAllMocks();
});

/** Fixtures */
const API_TOKEN = 'token-que-nao-pode-vazar';

/** Factories/helpers */
function writeConfig(config: object, fileName = 'dependencyChecks.json'): void {
  writeFileSync(join(projectDirectory, fileName), JSON.stringify(config));
}

function httpDependency(path: string, extra: object = {}): object {
  return { type: 'http', url: `\${API_BASE_URL}${path}`, headers: { authorization: `Bearer \${API_TOKEN}` }, ...extra };
}

function loggedLines(): string[] {
  return [...infoSpy.mock.calls, ...errorSpy.mock.calls].map(([message]) => message);
}

function loggedError(dependency: string): Error {
  const call = errorSpy.mock.calls.find(([message]) => message.includes(`dependency=${dependency} `));

  return call?.[2];
}

/** Testes */
describe('checkDependencies', () => {
  it('registra cada dependência e o resumo e devolve 0 quando todas respondem', async () => {
    writeConfig({ api: httpDependency('/health'), status: { type: 'http', url: `${baseUrl}/status` } });

    const exitCode = await checkDependencies([], projectDirectory, { API_BASE_URL: baseUrl, API_TOKEN });

    expect(exitCode).toBe(0);
    expect(loggedLines()).toEqual([
      expect.stringMatching(/^Dependency check finished \| dependency=environment outcome=success durationMs=\d+$/),
      expect.stringMatching(/^Dependency check finished \| dependency=api outcome=success durationMs=\d+$/),
      expect.stringMatching(/^Dependency check finished \| dependency=status outcome=success durationMs=\d+$/),
      'Dependency check summary | success=2 failure=0 skipped=0',
    ]);
    expect(errorSpy).not.toHaveBeenCalled();
  });

  it('devolve 1 na falha e mascara o segredo no erro registrado', async () => {
    handler = (request, response) => response.writeHead(401).end();
    writeConfig({ api: httpDependency(`/health?token=\${API_TOKEN}`) });

    const exitCode = await checkDependencies([], projectDirectory, { API_BASE_URL: baseUrl, API_TOKEN });

    expect(exitCode).toBe(1);
    expect(loggedError('api').message).toBe('Unexpected HTTP status | httpStatus=401');
    expect(errorSpy).toHaveBeenCalledWith(
      'Dependency check summary | success=0 failure=1 skipped=0',
      expect.any(String),
    );
    expect(JSON.stringify(errorSpy.mock.calls)).not.toContain(API_TOKEN);
  });

  it('mascara o segredo na mensagem sem apagar os caminhos da pilha', async () => {
    handler = (_request, response) => response.writeHead(401).end();
    writeConfig({ api: httpDependency('/health') });

    await checkDependencies([], projectDirectory, { API_BASE_URL: baseUrl, API_TOKEN: 'check-dependencies' });

    const { stack } = loggedError('api');
    expect(stack).toMatch(/^Error: Unexpected HTTP status \| httpStatus=401\n/);
    expect(stack).toContain('mind-scripts/check-dependencies/');
  });

  it('para na etapa environment quando falta variável, sem testar nenhuma dependência', async () => {
    const received = jest.fn();
    handler = (_request, response) => {
      received();
      response.writeHead(200).end();
    };
    writeConfig({ api: httpDependency('/health'), cache: { type: 'redis', port: 'porta' } });

    const exitCode = await checkDependencies([], projectDirectory, { API_BASE_URL: baseUrl, REDIS_HOST: 'redis' });

    expect(exitCode).toBe(1);
    expect(loggedError('environment').message).toBe(
      'Missing environment variables: API_TOKEN; port of "cache" must be a number between 1 and 65535',
    );
    expect(loggedLines()).toHaveLength(1);
    expect(received).not.toHaveBeenCalled();
  });

  it('registra como pulada a dependência desabilitada', async () => {
    writeConfig({ telemetry: httpDependency('/track', { enabled: '${TELEMETRY_ENABLED:-false}' }) });

    const exitCode = await checkDependencies([], projectDirectory, {});

    expect(exitCode).toBe(0);
    expect(infoSpy).toHaveBeenCalledWith(
      'Dependency check finished | dependency=telemetry outcome=skipped reason=disabled',
      expect.any(String),
    );
    expect(infoSpy).toHaveBeenCalledWith(
      'Dependency check summary | success=0 failure=0 skipped=1',
      expect.any(String),
    );
  });

  it('completa o ambiente com o .env, sem sobrepor a variável do processo', async () => {
    const paths: string[] = [];
    handler = (request, response) => {
      paths.push(request.url);
      response.writeHead(200).end();
    };
    writeFileSync(join(projectDirectory, '.env'), `API_BASE_URL=http://nao-usado.invalid\nAPI_TOKEN=${API_TOKEN}\n`);
    writeConfig({ api: httpDependency('/health') });

    const exitCode = await checkDependencies([], projectDirectory, { API_BASE_URL: baseUrl });

    expect(exitCode).toBe(0);
    expect(paths).toEqual(['/health']);
  });

  it('lê o arquivo indicado por --config', async () => {
    writeConfig({ status: { type: 'http', url: `${baseUrl}/status` } }, 'checks.local.json');

    const exitCode = await checkDependencies(['--config=checks.local.json'], projectDirectory, {});

    expect(exitCode).toBe(0);
    expect(infoSpy).toHaveBeenCalledWith(
      expect.stringContaining('dependency=status outcome=success'),
      expect.any(String),
    );
  });

  it('recusa a opção desconhecida', async () => {
    writeConfig({ status: { type: 'http', url: `${baseUrl}/status` } });

    const exitCode = await checkDependencies(['--verbose'], projectDirectory, {});

    expect(exitCode).toBe(1);
    expect(errorSpy).toHaveBeenCalledWith(
      'Dependency check crashed',
      expect.any(String),
      expect.objectContaining({
        message: 'Unknown option: --verbose\nUsage: mind-check-dependencies [--config=<file>]',
      }),
    );
  });

  it('registra a queda e devolve 1 quando o arquivo não existe', async () => {
    const exitCode = await checkDependencies([], projectDirectory, {});

    expect(exitCode).toBe(1);
    expect(errorSpy).toHaveBeenCalledWith(
      'Dependency check crashed',
      expect.any(String),
      expect.objectContaining({ message: expect.stringMatching(/^Failed to read .*dependencyChecks\.json: /) }),
    );
  });
});
