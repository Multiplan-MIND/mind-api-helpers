import { getMindFederationConfig } from './graphql-federation.config';

describe('getMindFederationConfig', () => {
  it('should pin federation v2.14 with the 13 directives @apollo/gateway acts on, in order', () => {
    expect(getMindFederationConfig()).toEqual({
      version: 2,
      importUrl: 'https://specs.apollo.dev/federation/v2.14',
      directives: [
        '@composeDirective',
        '@context',
        '@extends',
        '@external',
        '@fromContext',
        '@inaccessible',
        '@interfaceObject',
        '@key',
        '@override',
        '@provides',
        '@requires',
        '@shareable',
        '@tag',
      ],
    });
  });

  it('should leave out the directives only GraphOS Router enforces, so a subgraph cannot declare them', () => {
    const { directives } = getMindFederationConfig();

    for (const routerOnly of ['@authenticated', '@requiresScopes', '@policy', '@cost', '@listSize', '@cacheTag']) {
      expect(directives).not.toContain(routerOnly);
    }
  });

  it('should return a new object on every call, so mutating one does not leak into the next', () => {
    const first = getMindFederationConfig();
    first.directives.push('@cost');
    first.directives.sort();

    const second = getMindFederationConfig();
    expect(second).not.toBe(first);
    expect(second.directives).not.toBe(first.directives);
    expect(second.directives).toHaveLength(13);
    expect(second.directives[0]).toBe('@composeDirective');
  });
});
