import type { Federation2Config } from '@nestjs/graphql';

/**
 * Federation `@link` declared by every subgraph built with these services.
 *
 * Pinned to what @nestjs/graphql 12 (NestJS 10) emitted: federation v2.3 with these 11 directives, in this order.
 * Newer @nestjs/graphql defaults (v2.12 in 13, v2.14 in 14) cannot be composed by `mind-api-router`, whose
 * `@apollo/gateway` 2.4.x rejects them with "Invalid version ... for the federation feature". Raise it only
 * together with the router's gateway.
 */
export const MIND_FEDERATION_CONFIG: Federation2Config = {
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
};
