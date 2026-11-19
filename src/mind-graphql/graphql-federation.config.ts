import type { Federation2Config } from '@nestjs/graphql';

/**
 * Federation `@link` declared by every subgraph behind `mind-api-router`.
 *
 * v2.14 is the federation version the router's `@apollo/gateway` must compose; a gateway that does not know it
 * rejects the subgraph with "Invalid version ... for the federation feature". The import list carries only directives the gateway acts
 * on: the authorization (`@authenticated`, `@requiresScopes`, `@policy`), demand control (`@cost`, `@listSize`) and
 * `@cacheTag` directives are enforced only by GraphOS Router, so importing them would let a subgraph declare a
 * protection that `@apollo/gateway` silently ignores. Left out, a subgraph using one by its short name fails
 * composition with "Unknown directive".
 *
 * Returns a new object on every call, so a consumer that mutates it (`directives.push(...)`, `.sort()`) cannot
 * affect the services or other consumers.
 */
export const getMindFederationConfig = (): Federation2Config => ({
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
