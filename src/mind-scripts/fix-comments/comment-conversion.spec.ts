/**
 * Testes executados:
 * - convertComments
 *   - converte um comentário de linha inteira em bloco de uma linha, mantendo a indentação
 *   - junta as linhas consecutivas de mesma indentação num só bloco
 *   - absorve no bloco o // vazio que separa dois parágrafos
 *   - separa em blocos diferentes os comentários de indentações diferentes
 *   - mantém o comentário que vem depois de código
 *   - mantém as diretivas de ferramenta
 *   - mantém o comentário que contém a sequência de fechamento de bloco
 *   - mantém o // seguido só de espaços
 *   - reconhece o comentário depois de caracteres invisíveis
 *   - devolve o arquivo com \r\n quando ele usa \r\n
 *   - devolve o conteúdo intacto e a contagem zerada quando não há o que converter
 */

import { convertComments } from './comment-conversion';

/** Factories/helpers */
function lines(...content: string[]): string {
  return content.join('\n');
}

/** Testes */
describe('convertComments', () => {
  it('converte um comentário de linha inteira em bloco de uma linha, mantendo a indentação', () => {
    const conversion = convertComments(lines('function run() {', '  // explica o porquê', '  return 1;', '}'));

    expect(conversion).toEqual({
      content: lines('function run() {', '  /** explica o porquê */', '  return 1;', '}'),
      convertedCount: 1,
    });
  });

  it('junta as linhas consecutivas de mesma indentação num só bloco', () => {
    const conversion = convertComments(lines('// primeira linha', '// segunda linha', 'const value = 1;'));

    expect(conversion).toEqual({
      content: lines('/**', ' * primeira linha', ' * segunda linha', ' */', 'const value = 1;'),
      convertedCount: 2,
    });
  });

  it('absorve no bloco o // vazio que separa dois parágrafos', () => {
    const { content } = convertComments(lines('// primeiro parágrafo', '//', '// segundo parágrafo'));

    expect(content).toBe(lines('/**', ' * primeiro parágrafo', ' * segundo parágrafo', ' */'));
  });

  it('separa em blocos diferentes os comentários de indentações diferentes', () => {
    const { content } = convertComments(lines('// externo', '  // interno'));

    expect(content).toBe(lines('/** externo */', '  /** interno */'));
  });

  it('mantém o comentário que vem depois de código', () => {
    const source = lines("const url = 'https://example.com'; // endereço", 'run(); // chamada');

    expect(convertComments(source)).toEqual({ content: source, convertedCount: 0 });
  });

  it('mantém as diretivas de ferramenta', () => {
    const source = lines(
      '// eslint-disable-next-line no-console',
      '// @ts-expect-error',
      '// prettier-ignore',
      '// istanbul ignore next',
      '// c8 ignore next',
      '// v8 ignore next',
      '// webpackChunkName: "chunk"',
    );

    expect(convertComments(source).content).toBe(source);
  });

  it('mantém o comentário que contém a sequência de fechamento de bloco', () => {
    const source = '// termina em */ no meio';

    expect(convertComments(source).content).toBe(source);
  });

  it('mantém o // seguido só de espaços', () => {
    const source = lines('//   ', 'const value = 1;');

    expect(convertComments(source).content).toBe(source);
  });

  it('reconhece o comentário depois de caracteres invisíveis', () => {
    const { content } = convertComments('  // com espaço não separável﻿');

    expect(content).toBe('  /** com espaço não separável */');
  });

  it('devolve o arquivo com \\r\\n quando ele usa \\r\\n', () => {
    const { content } = convertComments('// primeira\r\n// segunda\r\nconst value = 1;\r\n');

    expect(content).toBe('/**\r\n * primeira\r\n * segunda\r\n */\r\nconst value = 1;\r\n');
  });

  it('devolve o conteúdo intacto e a contagem zerada quando não há o que converter', () => {
    const source = lines('/** já convertido */', 'const value = 1;', '');

    expect(convertComments(source)).toEqual({ content: source, convertedCount: 0 });
  });
});
