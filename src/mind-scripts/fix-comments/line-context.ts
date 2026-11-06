/**
 * Uma linha que começa com `//` só é comentário quando começa fora de um bloco aberto numa linha anterior e fora de uma
 * template string ainda não fechada. Converter a linha num desses contextos fecharia o bloco externo antes da hora ou
 * mudaria o texto da string. A varredura reconhece blocos, strings, template strings e as expressões `${}` dentro
 * delas, mas não literais de regex: uma crase ou aspa dentro de uma regex desalinha o contexto, e daí em diante as
 * linhas ficam como estão, que é o lado seguro do erro.
 */
type Frame = '`' | '{' | '${';

export interface LineContext {
  inBlockComment: boolean;
  frames: Frame[];
}

export function createLineContext(): LineContext {
  return { inBlockComment: false, frames: [] };
}

function isInsideTemplate(context: LineContext): boolean {
  return context.frames[context.frames.length - 1] === '`';
}

export function startsInsideCommentOrTemplate(context: LineContext): boolean {
  return context.inBlockComment || isInsideTemplate(context);
}

function skipQuotedString(line: string, start: number): number {
  const quote = line[start];
  let index = start + 1;

  while (index < line.length && line[index] !== quote) index += line[index] === '\\' ? 2 : 1;

  return index + 1;
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
  if (char === "'" || char === '"') return skipQuotedString(line, index);
  if (char === '`' || char === '{') context.frames.push(char);
  else if (char === '}') context.frames.pop();

  return index + 1;
}

/** Avança o contexto pela linha inteira, para que a linha seguinte saiba onde começa. */
export function advanceLineContext(context: LineContext, line: string): void {
  let index = 0;

  while (index < line.length) {
    if (context.inBlockComment) index = stepInBlockComment(context, line, index);
    else if (isInsideTemplate(context)) index = stepInTemplate(context, line, index);
    else index = stepInCode(context, line, index);
  }
}
