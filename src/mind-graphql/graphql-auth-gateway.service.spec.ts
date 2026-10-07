import { ApolloFederationDriverConfig } from '@nestjs/apollo';
import { Federation2Config, SchemaFileConfig } from '@nestjs/graphql';
import { TypeDefsDecoratorFactory } from '@nestjs/graphql/dist/federation/type-defs-decorator.factory.js';
import GraphQLJSON from 'graphql-type-json';

import { MIND_FEDERATION_CONFIG } from './graphql-federation.config';
import { GraphqlAuthGatewayService } from './graphql-auth-gateway.service';

// `graphql` is deliberately not a devDependency: consumers install this package with its devDependencies nested,
// and a second `graphql` copy there breaks their schema (`Int` from another realm). Stub the scalar instead.
jest.mock('graphql-type-json', () => ({ __esModule: true, default: { name: 'JSON' } }));

type LoggerMock = { debug: jest.Mock; error: jest.Mock };

// Runs the @nestjs/graphql code that writes the federation `@link` into the subgraph type defs
// (GraphQLFederationFactory -> TypeDefsDecoratorFactory -> TypeDefsFederation2Decorator) with the service options
const federationLinkOf = (options: ApolloFederationDriverConfig) => {
  const { federation } = options.autoSchemaFile as SchemaFileConfig;
  const config = federation as Federation2Config;
  const typeDefs = new TypeDefsDecoratorFactory()
    .create(config.version, 2)
    .decorate('type Query { ok: Boolean }', config);
  return typeDefs.trim().split('\n')[0].trim();
};

describe('GraphqlAuthGatewayService', () => {
  // The exact @link the subgraph declared under NestJS 10 (@nestjs/graphql 12); mind-api-router's gateway 2.4.x
  // rejects the newer defaults (v2.12, v2.14), so this line is part of the contract
  const NEST_10_FEDERATION_LINK =
    'extend schema @link(url: "https://specs.apollo.dev/federation/v2.3", import: ["@composeDirective", "@extends", ' +
    '"@external", "@inaccessible", "@interfaceObject", "@key", "@override", "@provides", "@requires", "@shareable", "@tag"])';

  let logger: LoggerMock;
  let service: GraphqlAuthGatewayService;

  const resolveContext = async (headers: Record<string, string>) => {
    const options = await service.createGqlOptions();
    return (options.context as (arg: unknown) => unknown)({ req: { headers } });
  };

  beforeEach(() => {
    logger = { debug: jest.fn(), error: jest.fn() };
    service = new GraphqlAuthGatewayService(logger as any, {} as any);
  });

  describe('createGqlOptions', () => {
    it('should build the federation 2 options on the default path', async () => {
      const options = await service.createGqlOptions();

      expect(options).toMatchObject({
        autoSchemaFile: { path: 'schema.gql', federation: MIND_FEDERATION_CONFIG },
        sortSchema: true,
        playground: false,
        status400ForVariableCoercionErrors: false,
        resolvers: { JSON: GraphQLJSON },
        resolverValidationOptions: { requireResolversToMatchSchema: 'ignore' },
      });
      expect(options.path).toBeUndefined();
      expect(options.plugins).toHaveLength(1);
      expect(options.context).toEqual(expect.any(Function));
    });

    it('should declare the NestJS 10 federation link (v2.3, 11 directives) in the generated subgraph SDL', async () => {
      const options = await service.createGqlOptions();

      expect(federationLinkOf(options)).toBe(NEST_10_FEDERATION_LINK);
    });
  });

  describe('context', () => {
    it('should return an empty identity when the gateway headers are absent', async () => {
      await expect(resolveContext({})).resolves.toEqual({
        mindUserId: null,
        mindUserRoles: null,
        mindSessionExpiresIn: null,
      });
    });

    it('should trust the identity injected by the gateway', async () => {
      await expect(
        resolveContext({
          'mind-user-id': 'user-1',
          'mind-user-roles': 'admin,user-viewer',
          'mind-session-expires-in': '2030-01-01T00:00:00Z',
        }),
      ).resolves.toEqual({
        mindUserId: 'user-1',
        mindUserRoles: ['admin', 'user-viewer'],
        mindSessionExpiresIn: new Date('2030-01-01T00:00:00Z'),
      });
    });

    it('should resolve to undefined and log when the roles header is missing', async () => {
      await expect(resolveContext({ 'mind-user-id': 'user-1' })).resolves.toBeUndefined();
      expect(logger.error).toHaveBeenCalledWith('Error setting context', expect.any(String), expect.any(TypeError));
    });
  });
});
