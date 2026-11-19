/**
 * Testes executados:
 * - pruneInvalidPaths
 *   - remove o caminho com nome de Service acima de 63 caracteres ou fora do DNS-1035 e devolve o que saiu
 *   - mantém o caminho com nome válido e o que não aponta para um Service
 *   - remove a regra que fica sem caminho nenhum
 *   - devolve sem path o caminho removido que não tem path
 *   - não mexe no documento sem spec.rules
 * - isLeftWithoutRules
 *   - aponta o Ingress sem regra e sem defaultBackend
 *   - não aponta o Ingress com regra, com defaultBackend ou sem spec.rules
 */

import { parseDocument } from 'yaml';

import { isLeftWithoutRules, pruneInvalidPaths } from './path-pruning';

/** Fixtures */
const VALID_SERVICE = 'concierge-develop';
const LONG_SERVICE = `concierge-${'a'.repeat(54)}`;

/** Factories/helpers */
function pathEntry(path: string, serviceName: string): object {
  return { path, pathType: 'Prefix', backend: { service: { name: serviceName, port: { number: 80 } } } };
}

function ingressDocument(...rules: object[][]) {
  return parseDocument(
    JSON.stringify({ kind: 'Ingress', spec: { rules: rules.map((paths) => ({ http: { paths } })) } }),
  );
}

function remainingPaths(document: ReturnType<typeof ingressDocument>): string[][] {
  const { spec } = document.toJS() as { spec: { rules: { http: { paths: { path: string }[] } }[] } };

  return spec.rules.map((rule) => rule.http.paths.map(({ path }) => path));
}

/** Testes */
describe('pruneInvalidPaths', () => {
  it('remove o caminho com nome de Service acima de 63 caracteres ou fora do DNS-1035 e devolve o que saiu', () => {
    const document = ingressDocument([
      pathEntry('/concierge/develop', VALID_SERVICE),
      pathEntry('/concierge/long', LONG_SERVICE),
      pathEntry('/concierge/upper', 'Concierge-Upper'),
      pathEntry('/concierge/dash', 'concierge-'),
    ]);

    expect(pruneInvalidPaths(document)).toEqual([
      { path: '/concierge/long', serviceName: LONG_SERVICE },
      { path: '/concierge/upper', serviceName: 'Concierge-Upper' },
      { path: '/concierge/dash', serviceName: 'concierge-' },
    ]);
    expect(remainingPaths(document)).toEqual([['/concierge/develop']]);
  });

  it('mantém o caminho com nome válido e o que não aponta para um Service', () => {
    const resourcePath = { path: '/static', pathType: 'Prefix', backend: { resource: { kind: 'Bucket', name: 'x' } } };
    const document = ingressDocument([pathEntry('/concierge/develop', 'a'.repeat(63)), resourcePath]);

    expect(pruneInvalidPaths(document)).toEqual([]);
    expect(remainingPaths(document)).toEqual([['/concierge/develop', '/static']]);
  });

  it('remove a regra que fica sem caminho nenhum', () => {
    const document = ingressDocument(
      [pathEntry('/concierge/long', LONG_SERVICE)],
      [pathEntry('/concierge/develop', VALID_SERVICE)],
    );

    expect(pruneInvalidPaths(document)).toHaveLength(1);
    expect(remainingPaths(document)).toEqual([['/concierge/develop']]);
  });

  it('devolve sem path o caminho removido que não tem path', () => {
    const entryWithoutPath = { pathType: 'ImplementationSpecific', backend: { service: { name: LONG_SERVICE } } };
    const document = ingressDocument([entryWithoutPath]);

    expect(pruneInvalidPaths(document)).toEqual([{ serviceName: LONG_SERVICE }]);
  });

  it('não mexe no documento sem spec.rules', () => {
    const document = parseDocument('kind: Service\nspec:\n  ports: []\n');

    expect(pruneInvalidPaths(document)).toEqual([]);
    expect(document.toString()).toBe('kind: Service\nspec:\n  ports: []\n');
  });
});

describe('isLeftWithoutRules', () => {
  it('aponta o Ingress sem regra e sem defaultBackend', () => {
    expect(isLeftWithoutRules(parseDocument('kind: Ingress\nspec:\n  rules: []\n'))).toBe(true);
  });

  it.each([
    ['com regra', 'kind: Ingress\nspec:\n  rules:\n    - host: a\n'],
    ['com defaultBackend', 'kind: Ingress\nspec:\n  defaultBackend:\n    service:\n      name: a\n  rules: []\n'],
    ['sem spec.rules', 'kind: Service\nspec:\n  ports: []\n'],
  ])('não aponta o Ingress %s', (_reason, source) => {
    expect(isLeftWithoutRules(parseDocument(source))).toBe(false);
  });
});
