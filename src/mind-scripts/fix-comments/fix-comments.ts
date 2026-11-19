import { globSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import { convertComments } from './comment-conversion';
import { IGNORED_PATHS, PREVIEW, SOURCE_FILES_PATTERN } from './constants';

export interface FixCommentsSummary {
  processedCount: number;
  convertedCount: number;
  errorCount: number;
}

function truncate(line: string | undefined): string | undefined {
  if (line === undefined || line.length <= PREVIEW.TRUNCATE_LINE_LENGTH) return line;

  return `${line.substring(0, PREVIEW.TRUNCATE_LINE_LENGTH)}...`;
}

/** A prévia compara as linhas pela posição, então serve de amostra e não de diff; o diff fica com o `git diff`. */
function showChanges(oldContent: string, newContent: string): void {
  const oldLines = oldContent.split(/\r?\n/);
  const newLines = newContent.split(/\r?\n/);
  let changesShown = 0;

  for (let index = 0; index < Math.min(oldLines.length, PREVIEW.MAX_LINES_TO_ANALYZE); index++) {
    if (changesShown >= PREVIEW.MAX_CHANGES_TO_SHOW) break;
    if (oldLines[index] === newLines[index]) continue;

    console.log(`    --- "${truncate(oldLines[index])}"`);
    console.log(`    +++ "${truncate(newLines[index])}"`);
    changesShown++;
  }
}

function processFile(projectDirectory: string, file: string): boolean {
  const filePath = join(projectDirectory, file);
  const content = readFileSync(filePath, { encoding: 'utf8' });
  const conversion = convertComments(content);

  if (conversion.content === content) return false;

  writeFileSync(filePath, conversion.content, { encoding: 'utf8' });
  console.log(`Converted ${conversion.convertedCount} comments in: ${file}`);
  showChanges(content, conversion.content);
  return true;
}

/** O erro de um arquivo é contado e relatado sem interromper os demais. */
export function fixComments(projectDirectory: string): FixCommentsSummary {
  const files = globSync(SOURCE_FILES_PATTERN, { cwd: projectDirectory, exclude: IGNORED_PATHS });
  const summary: FixCommentsSummary = { processedCount: 0, convertedCount: 0, errorCount: 0 };

  console.log(`Found ${files.length} files`);

  for (const file of files) {
    try {
      if (processFile(projectDirectory, file)) summary.convertedCount++;
      summary.processedCount++;
    } catch (error) {
      console.error(`Failed to process ${file}: ${(error as Error).message}`);
      summary.errorCount++;
    }
  }

  return summary;
}
