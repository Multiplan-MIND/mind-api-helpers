import {
  BLANK_COMMENT_REGEX,
  DIRECTIVE_PREFIXES,
  REMOVABLE_CHAR_CODES,
  SINGLE_LINE_COMMENT_REGEX,
  SPACE_LIKE_CHAR_CODES,
} from './constants';

export interface CommentConversion {
  content: string;
  convertedCount: number;
}

interface MatchedComment {
  indentation: string;
  comment: string;
}

const spaceLikePattern = new RegExp(`[${String.fromCodePoint(...SPACE_LIKE_CHAR_CODES)}]`, 'g');
const removablePattern = new RegExp(`[${String.fromCodePoint(...REMOVABLE_CHAR_CODES)}]`, 'g');

/** Caracteres invisíveis confundiriam a detecção da indentação e do marcador `//`. */
function cleanInvisibleChars(line: string): string {
  return line.replace(spaceLikePattern, ' ').replace(removablePattern, '');
}

function isDirectiveComment(comment: string): boolean {
  const trimmedComment = comment.trimStart();

  return DIRECTIVE_PREFIXES.some((prefix) => trimmedComment.startsWith(prefix));
}

/**
 * Um comentário que contém a sequência de fechamento de bloco fecharia o bloco gerado antes da hora e quebraria a
 * sintaxe do arquivo, então fica como está, assim como as diretivas de ferramenta. Um `//` seguido só de espaços é
 * espaçador, e não texto a converter.
 */
function matchComment(line: string): MatchedComment | null {
  const commentMatch = SINGLE_LINE_COMMENT_REGEX.exec(cleanInvisibleChars(line));

  if (!commentMatch) return null;

  const [, indentation, comment] = commentMatch;

  if (comment.trim() === '' || isDirectiveComment(comment) || comment.includes('*/')) return null;

  return { indentation, comment };
}

function matchBlankCommentIndentation(line: string): string | null {
  return BLANK_COMMENT_REGEX.exec(cleanInvisibleChars(line))?.[1] ?? null;
}

/**
 * Agrupa as linhas de comentário consecutivas de mesma indentação para que um parágrafo de várias linhas vire um só
 * bloco. Um `//` vazio no meio do parágrafo é absorvido, senão sobraria solto entre dois blocos gerados.
 */
function collectCommentRun(
  lines: string[],
  firstMatch: MatchedComment,
  firstIndex: number,
): { comments: string[]; nextIndex: number } {
  const comments = [firstMatch.comment];
  let nextIndex = firstIndex + 1;

  while (nextIndex < lines.length) {
    const nextMatch = matchComment(lines[nextIndex]);
    if (nextMatch?.indentation === firstMatch.indentation) comments.push(nextMatch.comment);
    else if (matchBlankCommentIndentation(lines[nextIndex]) !== firstMatch.indentation) break;
    nextIndex++;
  }

  return { comments, nextIndex };
}

function formatCommentBlock(indentation: string, comments: string[]): string[] {
  if (comments.length === 1) return [`${indentation}/** ${comments[0]} */`];

  return [`${indentation}/**`, ...comments.map((comment) => `${indentation} * ${comment}`), `${indentation} */`];
}

/**
 * Converte em bloco JSDoc cada comentário `//` que ocupa a linha inteira; comentário depois de código fica como está.
 * O arquivo volta com uma só quebra de linha, `\r\n` quando houver alguma.
 */
export function convertComments(content: string): CommentConversion {
  const lineEnding = content.includes('\r\n') ? '\r\n' : '\n';
  const lines = content.split(/\r?\n/);
  const result: string[] = [];
  let convertedCount = 0;
  let index = 0;

  while (index < lines.length) {
    const matched = matchComment(lines[index]);

    if (!matched) {
      result.push(lines[index]);
      index++;
      continue;
    }

    const { comments, nextIndex } = collectCommentRun(lines, matched, index);
    convertedCount += comments.length;
    result.push(...formatCommentBlock(matched.indentation, comments));
    index = nextIndex;
  }

  return { content: result.join(lineEnding), convertedCount };
}
