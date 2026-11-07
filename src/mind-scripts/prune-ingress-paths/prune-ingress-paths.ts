import { readFileSync, writeFileSync } from 'node:fs';
import { Document, parseAllDocuments } from 'yaml';

import { SEPARATOR } from './constants';
import { resolveIngressFilePath } from './ingress-file-path';
import { PrunedPath, pruneInvalidPaths } from './path-pruning';

function readDocuments(ingressFilePath: string): Document[] {
  const documents = parseAllDocuments(readFileSync(ingressFilePath, 'utf8'));
  if (documents.some((document) => document.errors.length > 0)) throw new Error(`${ingressFilePath} is not valid YAML`);

  return documents;
}

/** Cada documento depois do primeiro escreve o próprio separador, e sem ele os documentos se fundiriam. */
function writeDocuments(ingressFilePath: string, documents: Document[]): void {
  documents.slice(1).forEach((document) => {
    if (document.directives) document.directives.docStart = true;
  });
  writeFileSync(ingressFilePath, documents.map((document) => document.toString()).join(''));
}

function reportPrunedPaths(ingressFilePath: string, prunedPaths: PrunedPath[]): void {
  if (prunedPaths.length === 0) {
    console.log(`No invalid paths in ${ingressFilePath}`);
    return;
  }

  for (const { path, serviceName } of prunedPaths) {
    console.log(`Removed: path=${path} service=${serviceName} (${serviceName.length} characters)`);
  }
  console.log(`\n${prunedPaths.length} path(s) removed from ${ingressFilePath}`);
}

/**
 * Remove do arquivo de ingress compartilhado os caminhos que o Kubernetes recusaria pelo nome do Service e devolve o
 * código de saída do comando. O arquivo é um só para todos os branches, então uma entrada inválida gravada por um build
 * derrubaria o `kubectl apply` de todos os seguintes. Ele só é reescrito quando algo sai, para não reformatar a cada
 * build um arquivo que outras pipelines também editam.
 */
export function pruneIngressPaths(commandArguments: string[], workingDirectory: string): number {
  try {
    const ingressFilePath = resolveIngressFilePath(commandArguments, workingDirectory);
    const documents = readDocuments(ingressFilePath);
    const prunedPaths = documents.flatMap((document) => pruneInvalidPaths(document));

    if (prunedPaths.length > 0) writeDocuments(ingressFilePath, documents);

    console.log(`\n${SEPARATOR}\n     Ingress invalid paths cleanup\n${SEPARATOR}\n`);
    reportPrunedPaths(ingressFilePath, prunedPaths);
    console.log(`\n${SEPARATOR}\n`);

    return 0;
  } catch (error) {
    console.error((error as Error).message);
    return 1;
  }
}
