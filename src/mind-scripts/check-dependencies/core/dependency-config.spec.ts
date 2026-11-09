/**
 * Testes executados:
 * - readDependencyConfig
 *   - lê as dependências na ordem do arquivo, com o enabled separado dos campos
 *   - aceita a dependência sem campo nenhum, que usa os padrões
 *   - recusa o arquivo que não é JSON
 *   - recusa o conteúdo que não é objeto
 *   - recusa o arquivo sem dependência
 *   - recusa o tipo que o registro não tem
 *   - recusa a chave que o tipo não declara
 *   - recusa o campo com valor fora do formato, com a descrição do campo
 *   - recusa a dependência sem o campo obrigatório
 *   - recusa o enabled que não é texto
 */

import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { readDependencyConfig } from './dependency-config';
import { defineDependency } from './dependency-definition';
import { field } from './fields';

/** Configuração */
let workingDirectory: string;
let configPath: string;

beforeEach(() => {
  workingDirectory = mkdtempSync(join(tmpdir(), 'mind-check-dependencies-config-'));
  configPath = join(workingDirectory, 'dependencyChecks.json');
});

afterEach(() => {
  rmSync(workingDirectory, { recursive: true, force: true });
});

/** Fixtures */
const api = defineDependency({
  fields: { url: field.url(), method: field.oneOf(['GET', 'POST'], { default: 'GET' }), tags: field.textList() },
  check: () => Promise.resolve(),
});

const cache = defineDependency({
  fields: { host: field.text({ default: '${CACHE_HOST}' }) },
  check: () => Promise.resolve(),
});

const DEFINITIONS = { api, cache };

/** Factories/helpers */
function writeConfig(content: unknown): void {
  writeFileSync(configPath, typeof content === 'string' ? content : JSON.stringify(content));
}

function readError(content: unknown): string {
  writeConfig(content);
  try {
    readDependencyConfig(configPath, DEFINITIONS);
  } catch (error) {
    return (error as Error).message;
  }

  throw new Error('readDependencyConfig did not throw');
}

/** Testes */
describe('readDependencyConfig', () => {
  it('lê as dependências na ordem do arquivo, com o enabled separado dos campos', () => {
    writeConfig({
      valkey: { type: 'cache', host: 'cache.example.com' },
      telemetry: { type: 'api', enabled: '${TELEMETRY_ENABLED:-false}', url: 'https://example.com' },
    });

    expect(readDependencyConfig(configPath, DEFINITIONS)).toEqual([
      { dependency: 'valkey', definition: cache, enabled: undefined, fields: { host: 'cache.example.com' } },
      {
        dependency: 'telemetry',
        definition: api,
        enabled: '${TELEMETRY_ENABLED:-false}',
        fields: { url: 'https://example.com' },
      },
    ]);
  });

  it('aceita a dependência sem campo nenhum, que usa os padrões', () => {
    writeConfig({ valkey: { type: 'cache' } });

    expect(readDependencyConfig(configPath, DEFINITIONS)).toEqual([
      { dependency: 'valkey', definition: cache, enabled: undefined, fields: {} },
    ]);
  });

  it('recusa o arquivo que não é JSON', () => {
    expect(readError('{ cache')).toContain(`Failed to read ${configPath}`);
  });

  it('recusa o conteúdo que não é objeto', () => {
    expect(readError([{ type: 'cache' }])).toBe(`${configPath} must hold a JSON object`);
  });

  it('recusa o arquivo sem dependência', () => {
    expect(readError({})).toBe(`${configPath} declares no dependency`);
  });

  it('recusa o tipo que o registro não tem', () => {
    expect(readError({ queue: { type: 'kafka' } })).toBe(`type of "queue" in ${configPath} must be one of api, cache`);
    expect(readError({ queue: { type: 'toString' } })).toContain('must be one of api, cache');
    expect(readError({ queue: {} })).toContain('must be one of api, cache');
  });

  it('recusa a chave que o tipo não declara', () => {
    expect(readError({ valkey: { type: 'cache', uri: 'x' } })).toBe(`Unknown key "uri" in "valkey" in ${configPath}`);
    expect(readError({ valkey: { type: 'cache', constructor: 'x' } })).toContain('Unknown key "constructor"');
  });

  it('recusa o campo com valor fora do formato, com a descrição do campo', () => {
    expect(readError({ status: { type: 'api', url: 'https://example.com', method: 'DELETE' } })).toBe(
      `method of "status" in ${configPath} must be one of GET, POST`,
    );
    expect(readError({ status: { type: 'api', url: 'https://example.com', tags: 'a' } })).toContain(
      'tags of "status" in',
    );
  });

  it('recusa a dependência sem o campo obrigatório', () => {
    expect(readError({ status: { type: 'api' } })).toBe(`"status" in ${configPath} needs url`);
  });

  it('recusa o enabled que não é texto', () => {
    expect(readError({ status: { type: 'api', url: 'https://example.com', enabled: false } })).toContain(
      'enabled of "status"',
    );
  });
});
