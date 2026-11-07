import { existsSync, realpathSync } from 'node:fs';
import { extname, resolve, sep } from 'node:path';

import { INGRESS_FILE_EXTENSIONS, USAGE } from './constants';

function assertAllowedPath(filePath: string, workingDirectory: string, ingressFileArgument: string): void {
  if (!filePath.startsWith(workingDirectory + sep)) {
    throw new Error(`The ingress file must be inside ${workingDirectory}: ${ingressFileArgument}`);
  }

  if (!INGRESS_FILE_EXTENSIONS.has(extname(filePath).toLowerCase())) {
    throw new Error(`The ingress file must be .yml or .yaml: ${ingressFileArgument}`);
  }
}

/**
 * O comando reescreve o arquivo que recebe, então só aceita um YAML dentro do diretório de trabalho, e confere de novo
 * depois de resolver links simbólicos, que poderiam levar a outro arquivo.
 */
export function resolveIngressFilePath(commandArguments: string[], workingDirectory: string): string {
  const [ingressFileArgument, ...extraArguments] = commandArguments;
  if (!ingressFileArgument || extraArguments.length > 0) throw new Error(USAGE);

  const realWorkingDirectory = realpathSync(workingDirectory);
  const resolvedPath = resolve(realWorkingDirectory, ingressFileArgument);
  assertAllowedPath(resolvedPath, realWorkingDirectory, ingressFileArgument);
  if (!existsSync(resolvedPath)) throw new Error(`File not found: ${ingressFileArgument}`);

  const realPath = realpathSync(resolvedPath);
  assertAllowedPath(realPath, realWorkingDirectory, ingressFileArgument);

  return realPath;
}
