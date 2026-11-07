import { Document, isMap, isSeq } from 'yaml';

import { SERVICE_NAME_MAXIMUM_LENGTH, SERVICE_NAME_PATTERN } from './constants';

export interface PrunedPath {
  path: string;
  serviceName: string;
}

function isValidServiceName(serviceName: string): boolean {
  return serviceName.length <= SERVICE_NAME_MAXIMUM_LENGTH && SERVICE_NAME_PATTERN.test(serviceName);
}

/**
 * Remove do documento, no lugar, os caminhos cujo backend aponta para um nome de Service inválido e devolve o que foi
 * removido. Uma regra que fica sem caminho nenhum sai junto, porque o Kubernetes também recusa `http.paths` vazio.
 */
export function pruneInvalidPaths(document: Document): PrunedPath[] {
  const prunedPaths: PrunedPath[] = [];
  const rules = document.getIn(['spec', 'rules']);
  if (!isSeq(rules)) return prunedPaths;

  rules.items = rules.items.filter((rule) => {
    if (!isMap(rule)) return true;

    const paths = rule.getIn(['http', 'paths']);
    if (!isSeq(paths)) return true;

    paths.items = paths.items.filter((pathEntry) => {
      if (!isMap(pathEntry)) return true;

      const serviceName = pathEntry.getIn(['backend', 'service', 'name']);
      if (typeof serviceName !== 'string' || isValidServiceName(serviceName)) return true;

      prunedPaths.push({ path: String(pathEntry.get('path')), serviceName });
      return false;
    });

    return paths.items.length > 0;
  });

  return prunedPaths;
}
