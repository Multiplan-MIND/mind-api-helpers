/**
 * Testes executados:
 * - pruneInvalidPaths
 *   - remove o caminho com nome de Service acima de 63 caracteres ou fora do DNS-1035 e devolve o que saiu
 *   - mantém o caminho com nome válido e o que não aponta para um Service
 *   - remove a regra que fica sem caminho nenhum
 *   - não mexe no documento sem spec.rules
 */

import { parseDocument } from 'yaml';

import { pruneInvalidPaths } from './path-pruning';

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

  it('não mexe no documento sem spec.rules', () => {
    const document = parseDocument('kind: Service\nspec:\n  ports: []\n');

    expect(pruneInvalidPaths(document)).toEqual([]);
    expect(document.toString()).toBe('kind: Service\nspec:\n  ports: []\n');
  });
});
