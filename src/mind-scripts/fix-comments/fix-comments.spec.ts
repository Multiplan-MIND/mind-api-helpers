/**
 * Testes executados:
 * - fixComments
 *   - regrava só os arquivos que têm comentário a converter
 *   - procura em .ts, .tsx, .js e .jsx, inclusive em subdiretórios
 *   - ignora dependências, builds e documentação
 *   - conta o arquivo que falha e segue com os demais
 */

import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';

import { fixComments } from './fix-comments';

/** Configuração */
let projectDirectory: string;

beforeEach(() => {
  projectDirectory = mkdtempSync(join(tmpdir(), 'mind-fix-comments-'));
  jest.spyOn(console, 'log').mockImplementation(() => undefined);
  jest.spyOn(console, 'error').mockImplementation(() => undefined);
});

afterEach(() => {
  rmSync(projectDirectory, { recursive: true, force: true });
  jest.restoreAllMocks();
});

/** Fixtures */
const COMMENTED_SOURCE = '// explica o porquê\nconst value = 1;\n';
const CONVERTED_SOURCE = '/** explica o porquê */\nconst value = 1;\n';
const CLEAN_SOURCE = '/** já convertido */\nconst value = 1;\n';

/** Factories/helpers */
function writeProjectFile(file: string, content: string): string {
  const filePath = join(projectDirectory, file);
  mkdirSync(dirname(filePath), { recursive: true });
  writeFileSync(filePath, content);
  return filePath;
}

function readProjectFile(file: string): string {
  return readFileSync(join(projectDirectory, file), 'utf8');
}

/** Testes */
describe('fixComments', () => {
  it('regrava só os arquivos que têm comentário a converter', () => {
    writeProjectFile('src/commented.ts', COMMENTED_SOURCE);
    writeProjectFile('src/clean.ts', CLEAN_SOURCE);

    const summary = fixComments(projectDirectory);

    expect(summary).toEqual({ processedCount: 2, convertedCount: 1, errorCount: 0 });
    expect(readProjectFile('src/commented.ts')).toBe(CONVERTED_SOURCE);
    expect(readProjectFile('src/clean.ts')).toBe(CLEAN_SOURCE);
  });

  it('procura em .ts, .tsx, .js e .jsx, inclusive em subdiretórios', () => {
    const files = ['a.ts', 'src/b.tsx', 'src/nested/c.js', 'src/nested/deep/d.jsx'];
    files.forEach((file) => writeProjectFile(file, COMMENTED_SOURCE));
    writeProjectFile('notes.md', COMMENTED_SOURCE);

    const summary = fixComments(projectDirectory);

    expect(summary.convertedCount).toBe(files.length);
    files.forEach((file) => expect(readProjectFile(file)).toBe(CONVERTED_SOURCE));
    expect(readProjectFile('notes.md')).toBe(COMMENTED_SOURCE);
  });

  it('ignora dependências, builds e documentação', () => {
    const ignoredFiles = ['node_modules/library/index.js', 'dist/main.js', 'coverage/lcov.js', 'docs/example.ts'];
    ignoredFiles.forEach((file) => writeProjectFile(file, COMMENTED_SOURCE));

    const summary = fixComments(projectDirectory);

    expect(summary).toEqual({ processedCount: 0, convertedCount: 0, errorCount: 0 });
    ignoredFiles.forEach((file) => expect(readProjectFile(file)).toBe(COMMENTED_SOURCE));
  });

  it('conta o arquivo que falha e segue com os demais', () => {
    /** Um diretório com nome de arquivo casa com o padrão e falha na leitura, com ou sem permissão de root. */
    mkdirSync(join(projectDirectory, 'src/unreadable.ts'), { recursive: true });
    writeProjectFile('src/commented.ts', COMMENTED_SOURCE);

    const summary = fixComments(projectDirectory);

    expect(summary).toEqual({ processedCount: 1, convertedCount: 1, errorCount: 1 });
    expect(readProjectFile('src/commented.ts')).toBe(CONVERTED_SOURCE);
    expect(console.error).toHaveBeenCalledWith(expect.stringContaining('src/unreadable.ts'));
  });
});
