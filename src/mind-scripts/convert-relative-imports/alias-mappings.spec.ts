/**
 * Testes executados:
 * - loadAliasMappings
 *   - lê os aliases de pasta com os destinos a partir do baseUrl
 *   - aceita o destino *, que é a própria pasta do baseUrl
 *   - resolve os destinos a partir da pasta do tsconfig.json quando não há baseUrl
 *   - ordena do destino mais longo para o mais curto
 *   - ignora o alias exato, que aponta um único arquivo
 *   - recusa: sem tsconfig.json
 *   - recusa: com tsconfig.json que não é JSON puro
 *   - recusa: sem alias de pasta
 */

import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { loadAliasMappings } from './alias-mappings';

/** Configuração */
let projectDirectory: string;

beforeEach(() => {
  projectDirectory = mkdtempSync(join(tmpdir(), 'mind-alias-mappings-'));
});

afterEach(() => rmSync(projectDirectory, { recursive: true, force: true }));

/** Factories/helpers */
function writeTsconfig(compilerOptions: object): void {
  writeFileSync(join(projectDirectory, 'tsconfig.json'), JSON.stringify({ compilerOptions }));
}

/** Testes */
describe('loadAliasMappings', () => {
  it('lê os aliases de pasta com os destinos a partir do baseUrl', () => {
    writeTsconfig({ baseUrl: './src', paths: { '@bot/*': ['bot/*'] } });

    expect(loadAliasMappings(projectDirectory)).toEqual([
      { aliasPrefix: '@bot/', targetDirectory: join(projectDirectory, 'src', 'bot') },
    ]);
  });

  it('aceita o destino *, que é a própria pasta do baseUrl', () => {
    writeTsconfig({ baseUrl: './src', paths: { '@/*': ['*'] } });

    expect(loadAliasMappings(projectDirectory)).toEqual([
      { aliasPrefix: '@/', targetDirectory: join(projectDirectory, 'src') },
    ]);
  });

  it('resolve os destinos a partir da pasta do tsconfig.json quando não há baseUrl', () => {
    writeTsconfig({ paths: { '@app/*': ['./src/*'] } });

    expect(loadAliasMappings(projectDirectory)).toEqual([
      { aliasPrefix: '@app/', targetDirectory: join(projectDirectory, 'src') },
    ]);
  });

  it('ordena do destino mais longo para o mais curto', () => {
    writeTsconfig({ paths: { '@app/*': ['src/*'], '@bot/*': ['src/bot/*'], '@bot-config/*': ['src/bot-config/*'] } });

    expect(loadAliasMappings(projectDirectory).map(({ aliasPrefix }) => aliasPrefix)).toEqual([
      '@bot-config/',
      '@bot/',
      '@app/',
    ]);
  });

  it('ignora o alias exato, que aponta um único arquivo', () => {
    writeTsconfig({ paths: { '@config': ['src/config/index.ts'], '@app/*': ['src/*'] } });

    expect(loadAliasMappings(projectDirectory).map(({ aliasPrefix }) => aliasPrefix)).toEqual(['@app/']);
  });

  it.each([
    ['sem tsconfig.json', undefined, 'File not found'],
    ['com tsconfig.json que não é JSON puro', '{ /** alias */ "compilerOptions": {} }', 'as plain JSON'],
    ['sem alias de pasta', JSON.stringify({ compilerOptions: { paths: { '@config': ['src/config.ts'] } } }), '/*'],
  ])('recusa: %s', (_case, content, message) => {
    if (content !== undefined) writeFileSync(join(projectDirectory, 'tsconfig.json'), content);

    expect(() => loadAliasMappings(projectDirectory)).toThrow(message);
  });
});
