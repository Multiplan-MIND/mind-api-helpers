import { Document, isMap, isSeq } from 'yaml';

import { SERVICE_NAME_MAXIMUM_LENGTH, SERVICE_NAME_PATTERN } from './constants';

/** O `path` é opcional no Kubernetes quando o `pathType` é `ImplementationSpecific`. */
export interface PrunedPath {
  path?: string;
  serviceName: string;
}

function isValidServiceName(serviceName: string): boolean {
  return serviceName.length <= SERVICE_NAME_MAXIMUM_LENGTH && SERVICE_NAME_PATTERN.test(serviceName);
}

/** Um Ingress sem regra nenhuma e sem `defaultBackend` também é recusado pelo Kubernetes. */
export function isLeftWithoutRules(document: Document): boolean {
  const rules = document.getIn(['spec', 'rules']);

  return isSeq(rules) && rules.items.length === 0 && !document.hasIn(['spec', 'defaultBackend']);
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

      const path = pathEntry.get('path');
      prunedPaths.push(path == null ? { serviceName } : { path: String(path), serviceName });
      return false;
    });

    return paths.items.length > 0;
  });

  return prunedPaths;
}
