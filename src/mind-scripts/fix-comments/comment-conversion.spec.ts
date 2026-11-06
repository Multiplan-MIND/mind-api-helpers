/**
 * Testes executados:
 * - convertComments
 *   - converte um comentário de linha inteira em bloco de uma linha, mantendo a indentação
 *   - junta as linhas consecutivas de mesma indentação num só bloco
 *   - separa os parágrafos do bloco no // vazio entre eles
 *   - mantém o // vazio que fecha a sequência de comentários
 *   - separa em blocos diferentes os comentários de indentações diferentes
 *   - mantém o comentário que vem depois de código
 *   - mantém as diretivas de ferramenta
 *   - mantém o comentário que contém a sequência de fechamento de bloco
 *   - mantém o // que começa dentro de um bloco aberto numa linha anterior
 *   - mantém o // que começa dentro de uma template string e volta a converter depois dela
 *   - pula a aspa de uma regex antes de abrir a template string
 *   - pula a chave de uma regex dentro de ${}
 *   - trata como divisão a / depois de identificador, número ou parêntese
 *   - não abre regex no /> que fecha uma tag JSX, nem depois de chave
 *   - para de converter até o fim do arquivo quando uma string não fecha na linha
 *   - para de converter até o fim do arquivo quando uma chave fecha sem ter aberto
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

  it('separa os parágrafos do bloco no // vazio entre eles', () => {
    expect(convertComments(lines('// primeiro parágrafo', '//', '// segundo parágrafo'))).toEqual({
      content: lines('/**', ' * primeiro parágrafo', ' *', ' * segundo parágrafo', ' */'),
      convertedCount: 2,
    });
  });

  it('mantém o // vazio que fecha a sequência de comentários', () => {
    const { content } = convertComments(lines('// explicação', '//', 'const value = 1;'));

    expect(content).toBe(lines('/** explicação */', '//', 'const value = 1;'));
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
      '/// <reference types="vite/client" />',
      '//# sourceMappingURL=index.js.map',
      '//#region helpers',
    );

    expect(convertComments(source).content).toBe(source);
  });

  it('mantém o comentário que contém a sequência de fechamento de bloco', () => {
    const source = '// termina em */ no meio';

    expect(convertComments(source).content).toBe(source);
  });

  it('mantém o // que começa dentro de um bloco aberto numa linha anterior', () => {
    const source = lines('/*', '  // old();', '*/', 'const value = 1;');

    expect(convertComments(source).content).toBe(source);
  });

  it('mantém o // que começa dentro de uma template string e volta a converter depois dela', () => {
    const { content } = convertComments(
      lines('const text = `${value({ key: "}" })}', '// texto da string', '`;', '// depois da string'),
    );

    expect(content).toBe(
      lines('const text = `${value({ key: "}" })}', '// texto da string', '`;', '/** depois da string */'),
    );
  });

  it('pula a aspa de uma regex antes de abrir a template string', () => {
    const source = lines('const text = value.replace(/\'/g, "\\\'") + `', '// texto da string', '`;');

    expect(convertComments(source).content).toBe(source);
  });

  it('pula a chave de uma regex dentro de ${}', () => {
    const source = lines('const text = `${value.match(/{/)}', '// texto da string', '`;');

    expect(convertComments(source).content).toBe(source);
  });

  it('trata como divisão a / depois de identificador, número ou parêntese', () => {
    const { content } = convertComments(lines('const half = (total / 2) / count;', '// depois da divisão'));

    expect(content).toBe(lines('const half = (total / 2) / count;', '/** depois da divisão */'));
  });

  it('não abre regex no /> que fecha uma tag JSX, nem depois de chave', () => {
    const source = lines('return (', '  <Route', '    element={<Page />}', '  />', ');', '// depois do JSX');

    expect(convertComments(source).content).toBe(
      lines('return (', '  <Route', '    element={<Page />}', '  />', ');', '/** depois do JSX */'),
    );
  });

  it('para de converter até o fim do arquivo quando uma string não fecha na linha', () => {
    const source = lines("const text = 'sem fechamento", '// depois da string', '', '// mais adiante');

    expect(convertComments(source).content).toBe(source);
  });

  it('para de converter até o fim do arquivo quando uma chave fecha sem ter aberto', () => {
    const source = lines('}', '// depois da chave');

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
