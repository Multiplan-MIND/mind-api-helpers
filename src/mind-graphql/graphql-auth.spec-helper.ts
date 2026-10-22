// Shared by the GraphQL auth service specs. Each spec still needs its own
//
//   jest.mock('graphql-type-json', () => ({ __esModule: true, default: { name: 'JSON' } }));
//
// because Jest hoists `jest.mock` per file. The scalar is stubbed because `graphql` is deliberately not a
// devDependency: consumers install this package with its devDependencies nested, and a second `graphql` copy there
// breaks their schema (`Int` from another realm).

import { ApolloFederationDriverConfig } from '@nestjs/apollo';
import { Federation2Config, SchemaFileConfig } from '@nestjs/graphql';
import { TypeDefsDecoratorFactory } from '@nestjs/graphql/dist/federation/type-defs-decorator.factory.js';

export type LoggerMock = { debug: jest.Mock; error: jest.Mock };

export const createLoggerMock = (): LoggerMock => ({ debug: jest.fn(), error: jest.fn() });

export const EMPTY_IDENTITY = { mindUserId: null, mindUserRoles: null, mindSessionExpiresIn: null };

export const resolveContext = async (
  service: { createGqlOptions: () => Promise<{ context?: unknown }> },
  headers: Record<string, string>,
) => {
  const options = await service.createGqlOptions();
  return (options.context as (arg: unknown) => unknown)({ req: { headers } });
};

// The exact @link the subgraph declared under NestJS 10 (@nestjs/graphql 12); mind-api-router's gateway 2.4.x
// rejects the newer defaults (v2.12, v2.14), so this line is part of the contract
export const NEST_10_FEDERATION_LINK =
  'extend schema @link(url: "https://specs.apollo.dev/federation/v2.3", import: ["@composeDirective", "@extends", ' +
  '"@external", "@inaccessible", "@interfaceObject", "@key", "@override", "@provides", "@requires", "@shareable", "@tag"])';

// Runs the @nestjs/graphql code that writes the federation `@link` into the subgraph type defs
// (TypeDefsDecoratorFactory -> TypeDefsFederation2Decorator) with the service options.
//
// This covers the decorator step only, not the SDL a subgraph publishes: GraphQLFederationFactory, which reads
// `autoSchemaFile.federation` and builds that SDL, imports `graphql` at module level, and `graphql` cannot be a
// devDependency here. The factory is called with the federation major fixed at 2, and the import below relies on a
// path the package `exports` map exposes (`./*`) although the class is not exported from the package root. The
// published `@link` has to be checked outside this library: `{ _service { sdl } }` on a consuming service, or the
// composition check of mind-api-router.
export const federationLinkOf = (options: ApolloFederationDriverConfig) => {
  const { federation } = options.autoSchemaFile as SchemaFileConfig;
  const config = federation as Federation2Config;
  const typeDefs = new TypeDefsDecoratorFactory().create(config.version, 2).decorate('type Query { ok: Boolean }', config);
  return typeDefs.trim().split('\n')[0].trim();
};
