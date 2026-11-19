import { existsSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

import { TSCONFIG_FILE_NAME } from './constants';

export interface AliasMapping {
  aliasPrefix: string;
  targetDirectory: string;
}

interface TsconfigContent {
  compilerOptions?: {
    baseUrl?: unknown;
    paths?: unknown;
  };
}

const WILDCARD_SUFFIX = '/*';

/** O `JSON.parse` não aceita comentários, então um `tsconfig.json` com eles é recusado com o motivo. */
function readTsconfig(tsconfigPath: string): TsconfigContent {
  if (!existsSync(tsconfigPath)) throw new Error(`File not found: ${tsconfigPath}`);

  try {
    return JSON.parse(readFileSync(tsconfigPath, 'utf8')) as TsconfigContent;
  } catch (error) {
    throw new Error(`Failed to read ${tsconfigPath} as plain JSON: ${(error as Error).message}`);
  }
}

function toAliasMapping(alias: string, targets: unknown, baseDirectory: string): AliasMapping | undefined {
  const [target] = Array.isArray(targets) ? targets : [];
  const isFolderTarget = typeof target === 'string' && (target === '*' || target.endsWith(WILDCARD_SUFFIX));
  if (!alias.endsWith(WILDCARD_SUFFIX) || !isFolderTarget) return undefined;

  return { aliasPrefix: alias.slice(0, -1), targetDirectory: resolve(baseDirectory, target.slice(0, -1)) };
}

/**
 * Só entram os aliases de pasta, terminados em `/*` e com destino `dir/*` ou `*`, que é a própria base: um alias exato
 * aponta um único arquivo, que não se troca por prefixo. Os destinos vêm do `baseUrl`, ou da pasta do `tsconfig.json`
 * sem ele, e ficam do mais longo para o mais curto, para que `@app/*` não capture o que um alias de módulo cobre.
 */
export function loadAliasMappings(projectDirectory: string): AliasMapping[] {
  const tsconfigPath = join(projectDirectory, TSCONFIG_FILE_NAME);
  const { baseUrl, paths } = readTsconfig(tsconfigPath).compilerOptions ?? {};
  const baseDirectory = resolve(projectDirectory, typeof baseUrl === 'string' ? baseUrl : '.');

  const mappings = Object.entries(typeof paths === 'object' && paths !== null ? paths : {})
    .map(([alias, targets]) => toAliasMapping(alias, targets, baseDirectory))
    .filter((mapping): mapping is AliasMapping => mapping !== undefined);

  if (mappings.length === 0) throw new Error(`${tsconfigPath} has no compilerOptions.paths alias ending in /*`);

  return mappings.sort((first, second) => second.targetDirectory.length - first.targetDirectory.length);
}
