/**
 * Testes executados:
 * - convertRelativeImports
 *   - regrava só os arquivos que têm import a converter e conta os imports
 *   - procura só nos .ts de src/, inclusive em subdiretórios
 *   - conta o arquivo que falha e segue com os demais
 *   - recusa o projeto sem alias no tsconfig.json
 */

import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';

import { convertRelativeImports } from './convert-relative-imports';

/** Configuração */
let projectDirectory: string;

beforeEach(() => {
  projectDirectory = mkdtempSync(join(tmpdir(), 'mind-convert-relative-imports-'));
  writeProjectFile('tsconfig.json', JSON.stringify({ compilerOptions: { paths: { '@app/*': ['src/*'] } } }));
  jest.spyOn(console, 'log').mockImplementation(() => undefined);
  jest.spyOn(console, 'error').mockImplementation(() => undefined);
});

afterEach(() => {
  rmSync(projectDirectory, { recursive: true, force: true });
  jest.restoreAllMocks();
});

/** Fixtures */
const RELATIVE_SOURCE = "import { a } from '../shared/a';\nimport { b } from '../shared/b';\n";
const ALIASED_SOURCE = "import { a } from '@app/shared/a';\nimport { b } from '@app/shared/b';\n";

/** Factories/helpers */
function writeProjectFile(file: string, content: string): void {
  const filePath = join(projectDirectory, file);
  mkdirSync(dirname(filePath), { recursive: true });
  writeFileSync(filePath, content);
}

function readProjectFile(file: string): string {
  return readFileSync(join(projectDirectory, file), 'utf8');
}

/** Testes */
describe('convertRelativeImports', () => {
  it('regrava só os arquivos que têm import a converter e conta os imports', () => {
    writeProjectFile('src/bot/bot.service.ts', RELATIVE_SOURCE);
    writeProjectFile('src/bot/bot.module.ts', ALIASED_SOURCE);

    const summary = convertRelativeImports(projectDirectory);

    expect(summary).toEqual({ processedCount: 2, convertedCount: 1, importCount: 2, errorCount: 0 });
    expect(readProjectFile('src/bot/bot.service.ts')).toBe(ALIASED_SOURCE);
    expect(readProjectFile('src/bot/bot.module.ts')).toBe(ALIASED_SOURCE);
  });

  it('procura só nos .ts de src/, inclusive em subdiretórios', () => {
    writeProjectFile('src/bot/nested/deep/handler.ts', RELATIVE_SOURCE);
    writeProjectFile('src/bot/script.js', RELATIVE_SOURCE);
    writeProjectFile('test/bot/bot.e2e-spec.ts', RELATIVE_SOURCE);

    const summary = convertRelativeImports(projectDirectory);

    expect(summary.convertedCount).toBe(1);
    expect(readProjectFile('src/bot/nested/deep/handler.ts')).toContain("from '@app/bot/nested/shared/a'");
    expect(readProjectFile('src/bot/script.js')).toBe(RELATIVE_SOURCE);
    expect(readProjectFile('test/bot/bot.e2e-spec.ts')).toBe(RELATIVE_SOURCE);
  });

  it('conta o arquivo que falha e segue com os demais', () => {
    mkdirSync(join(projectDirectory, 'src', 'unreadable.ts'), { recursive: true });
    writeProjectFile('src/bot/bot.service.ts', RELATIVE_SOURCE);

    const summary = convertRelativeImports(projectDirectory);

    expect(summary).toEqual({ processedCount: 1, convertedCount: 1, importCount: 2, errorCount: 1 });
    expect(console.error).toHaveBeenCalledWith(expect.stringContaining('Failed to process src/unreadable.ts'));
  });

  it('recusa o projeto sem alias no tsconfig.json', () => {
    writeProjectFile('tsconfig.json', JSON.stringify({ compilerOptions: {} }));

    expect(() => convertRelativeImports(projectDirectory)).toThrow('has no compilerOptions.paths alias ending in /*');
  });
});
