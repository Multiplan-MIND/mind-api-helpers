import { getMindFederationConfig } from './graphql-federation.config';

describe('getMindFederationConfig', () => {
  it('should pin federation v2.3 with the 11 directives NestJS 10 imported, in order', () => {
    expect(getMindFederationConfig()).toEqual({
      version: 2,
      importUrl: 'https://specs.apollo.dev/federation/v2.3',
      directives: [
        '@composeDirective',
        '@extends',
        '@external',
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

  it('should return a new object on every call, so mutating one does not leak into the next', () => {
    const first = getMindFederationConfig();
    first.directives.push('@cost');
    first.directives.sort();

    const second = getMindFederationConfig();
    expect(second).not.toBe(first);
    expect(second.directives).not.toBe(first.directives);
    expect(second.directives).toHaveLength(11);
    expect(second.directives[0]).toBe('@composeDirective');
  });
});
