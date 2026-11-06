/**
 * Uma linha que começa com `//` só é comentário quando começa fora de um bloco aberto numa linha anterior e fora de uma
 * template string ainda não fechada. Converter a linha num desses contextos fecharia o bloco externo antes da hora ou
 * mudaria o texto da string. A varredura reconhece blocos, strings, template strings, as expressões `${}` dentro delas
 * e literais de regex. Quando perde o fio, numa string ou regex que não fecha na própria linha ou numa chave sem
 * abertura, ela não volta a converter até o fim do arquivo, porque daí em diante não sabe onde cada linha começa.
 */
type Frame = '`' | '{' | '${';

export interface LineContext {
  inBlockComment: boolean;
  frames: Frame[];
  lost: boolean;
}

/**
 * Depois de um destes caracteres ou palavras, uma `/` abre uma regex; depois de identificador, número, `)`, `]` ou `}`,
 * é divisão. `<` e `>` ficam de fora porque, em JSX, a `/` de `</div>` não abre regex.
 */
const REGEX_PRECEDING_CHARS = '(,=:[!&|?{;+-*%~^';
const REGEX_PRECEDING_KEYWORDS = new Set([
  'return',
  'typeof',
  'instanceof',
  'in',
  'of',
  'new',
  'delete',
  'void',
  'throw',
  'case',
  'do',
  'else',
  'yield',
  'await',
]);

export function createLineContext(): LineContext {
  return { inBlockComment: false, frames: [], lost: false };
}

function isInsideTemplate(context: LineContext): boolean {
  return context.frames[context.frames.length - 1] === '`';
}

export function canConvertLine(context: LineContext): boolean {
  return !context.lost && !context.inBlockComment && !isInsideTemplate(context);
}

/** Devolve a posição depois da aspa de fechamento, ou uma posição além do fim da linha quando ela não fecha. */
function skipQuotedString(line: string, start: number): number {
  const quote = line[start];
  let index = start + 1;

  while (index < line.length && line[index] !== quote) index += line[index] === '\\' ? 2 : 1;

  return index + 1;
}

/**
 * Varre de trás para a frente em vez de usar `/[\w$]+$/`: sem âncora no início, a regex recomeça em cada posição de
 * uma sequência longa de caracteres de palavra, e o custo fica quadrático no tamanho dela.
 */
function trailingWord(text: string): string {
  let start = text.length;

  while (start > 0 && /[\w$]/.test(text[start - 1])) start--;

  return text.slice(start);
}

/** O `/>` que fecha uma tag JSX, mesmo sozinho no começo da linha, não abre regex. */
function startsRegexLiteral(line: string, index: number): boolean {
  if (line[index + 1] === '>') return false;

  const before = line.slice(0, index).trimEnd();

  if (before === '' || REGEX_PRECEDING_CHARS.includes(before[before.length - 1])) return true;

  return REGEX_PRECEDING_KEYWORDS.has(trailingWord(before));
}

/** Uma `/` dentro de uma classe `[]` não fecha a regex. Como `skipQuotedString`, passa do fim quando ela não fecha. */
function skipRegexLiteral(line: string, start: number): number {
  let index = start + 1;
  let inCharacterClass = false;

  while (index < line.length) {
    const char = line[index];

    if (char === '\\') index++;
    else if (char === '[') inCharacterClass = true;
    else if (char === ']') inCharacterClass = false;
    else if (char === '/' && !inCharacterClass) return index + 1;
    index++;
  }

  return index + 1;
}

function skipLiteral(context: LineContext, line: string, end: number): number {
  if (end > line.length) context.lost = true;

  return end;
}

function stepInBlockComment(context: LineContext, line: string, index: number): number {
  if (!line.startsWith('*/', index)) return index + 1;

  context.inBlockComment = false;
  return index + 2;
}

function stepInTemplate(context: LineContext, line: string, index: number): number {
  if (line[index] === '\\') return index + 2;
  if (line[index] === '`') {
    context.frames.pop();
    return index + 1;
  }
  if (!line.startsWith('${', index)) return index + 1;

  context.frames.push('${');
  return index + 2;
}

function stepInCode(context: LineContext, line: string, index: number): number {
  const char = line[index];

  if (line.startsWith('//', index)) return line.length;
  if (line.startsWith('/*', index)) {
    context.inBlockComment = true;
    return index + 2;
  }
  if (char === "'" || char === '"') return skipLiteral(context, line, skipQuotedString(line, index));
  if (char === '/' && startsRegexLiteral(line, index)) return skipLiteral(context, line, skipRegexLiteral(line, index));
  if (char === '`' || char === '{') context.frames.push(char);
  else if (char === '}' && context.frames.length === 0) context.lost = true;
  else if (char === '}') context.frames.pop();

  return index + 1;
}

/** Avança o contexto pela linha inteira, para que a linha seguinte saiba onde começa. */
export function advanceLineContext(context: LineContext, line: string): void {
  let index = 0;

  while (index < line.length && !context.lost) {
    if (context.inBlockComment) index = stepInBlockComment(context, line, index);
    else if (isInsideTemplate(context)) index = stepInTemplate(context, line, index);
    else index = stepInCode(context, line, index);
  }
}
