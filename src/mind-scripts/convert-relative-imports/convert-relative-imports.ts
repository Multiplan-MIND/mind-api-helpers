import { globSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import { AliasMapping, loadAliasMappings } from './alias-mappings';
import { SOURCE_FILES_PATTERN } from './constants';
import { convertImports } from './import-conversion';

export interface ConvertRelativeImportsSummary {
  processedCount: number;
  convertedCount: number;
  importCount: number;
  errorCount: number;
}

function processFile(projectDirectory: string, file: string, mappings: AliasMapping[]): number {
  const filePath = join(projectDirectory, file);
  const content = readFileSync(filePath, { encoding: 'utf8' });
  const conversion = convertImports(content, filePath, mappings);

  if (conversion.convertedCount === 0) return 0;

  writeFileSync(filePath, conversion.content, { encoding: 'utf8' });
  console.log(`Converted ${conversion.convertedCount} imports in: ${file}`);
  return conversion.convertedCount;
}

/** Sem alias no `tsconfig.json` nada é convertido, e o erro sobe; o erro de um arquivo é contado e os demais seguem. */
export function convertRelativeImports(projectDirectory: string): ConvertRelativeImportsSummary {
  const mappings = loadAliasMappings(projectDirectory);
  const files = globSync(SOURCE_FILES_PATTERN, { cwd: projectDirectory });
  const summary: ConvertRelativeImportsSummary = {
    processedCount: 0,
    convertedCount: 0,
    importCount: 0,
    errorCount: 0,
  };

  console.log(`Found ${files.length} files`);

  for (const file of files) {
    try {
      const importCount = processFile(projectDirectory, file, mappings);
      if (importCount > 0) summary.convertedCount++;
      summary.importCount += importCount;
      summary.processedCount++;
    } catch (error) {
      console.error(`Failed to process ${file}: ${(error as Error).message}`);
      summary.errorCount++;
    }
  }

  return summary;
}
