import { dirname, isAbsolute, relative, resolve, sep } from 'node:path';

import { AliasMapping } from './alias-mappings';
import { RELATIVE_IMPORT_REGEX } from './constants';

export interface ImportConversion {
  content: string;
  convertedCount: number;
}

/** A própria pasta do alias não vira `@alias/`, que não é um caminho; ela fica para um alias mais genérico. */
function toAliasSpecifier(importedPath: string, mappings: AliasMapping[]): string | undefined {
  for (const { aliasPrefix, targetDirectory } of mappings) {
    const pathInTarget = relative(targetDirectory, importedPath);
    const isInside = pathInTarget !== '' && pathInTarget !== '..' && !pathInTarget.startsWith(`..${sep}`);

    if (isInside && !isAbsolute(pathInTarget)) return aliasPrefix + pathInTarget.split(sep).join('/');
  }

  return undefined;
}

/**
 * Troca pelo alias cada import relativo que algum alias cobre, no conteúdo inteiro, para preservar as quebras de linha;
 * o que nenhum alias cobre, como um caminho fora das pastas dos aliases, fica como está.
 */
export function convertImports(content: string, filePath: string, mappings: AliasMapping[]): ImportConversion {
  let convertedCount = 0;

  const convertedContent = content.replace(
    RELATIVE_IMPORT_REGEX,
    (match: string, keyword: string, quote: string, specifier: string) => {
      const aliasSpecifier = toAliasSpecifier(resolve(dirname(filePath), specifier), mappings);
      if (!aliasSpecifier) return match;

      convertedCount++;
      return `${keyword}${quote}${aliasSpecifier}${quote}`;
    },
  );

  return { content: convertedContent, convertedCount };
}
