import { generateKeyPairSync, KeyObject } from 'crypto';
import * as jwt from 'jsonwebtoken';
import axios from 'axios';
import { pathToRegexp } from 'path-to-regexp';
import { ApolloFederationDriverConfig } from '@nestjs/apollo';
import { Federation2Config, SchemaFileConfig } from '@nestjs/graphql';
import { TypeDefsDecoratorFactory } from '@nestjs/graphql/dist/federation/type-defs-decorator.factory.js';
import GraphQLJSON from 'graphql-type-json';

import { MIND_FEDERATION_CONFIG } from './graphql-federation.config';
import { GraphqlAuthJwksService } from './graphql-auth-jwks.service';

jest.mock('axios');
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
type RedisMock = { get: jest.Mock; set: jest.Mock };

describe('GraphqlAuthJwksService', () => {
  // The exact @link the subgraph declared under NestJS 10 (@nestjs/graphql 12); mind-api-router's gateway 2.4.x
  // rejects the newer defaults (v2.12, v2.14), so this line is part of the contract
  const NEST_10_FEDERATION_LINK =
    'extend schema @link(url: "https://specs.apollo.dev/federation/v2.3", import: ["@composeDirective", "@extends", ' +
    '"@external", "@inaccessible", "@interfaceObject", "@key", "@override", "@provides", "@requires", "@shareable", "@tag"])';

  const kid = 'test-kid';
  let privateKey: KeyObject;
  let publicKey: KeyObject;
  let publicPem: string;

  let logger: LoggerMock;
  let redis: RedisMock;
  let service: GraphqlAuthJwksService;

  const sign = (payload: object) => jwt.sign(payload, privateKey, { algorithm: 'RS256', keyid: kid });
  const resolveContext = async (headers: Record<string, string>) => {
    const options = await service.createGqlOptions();
    return (options.context as (arg: unknown) => Promise<unknown>)({ req: { headers } });
  };

  beforeAll(() => {
    ({ privateKey, publicKey } = generateKeyPairSync('rsa', { modulusLength: 2048 }));
    publicPem = publicKey.export({ type: 'spki', format: 'pem' }).toString();
  });

  beforeEach(() => {
    logger = { debug: jest.fn(), error: jest.fn() };
    redis = { get: jest.fn().mockResolvedValue(publicPem), set: jest.fn().mockResolvedValue('OK') };
    service = new GraphqlAuthJwksService(logger as any, redis as any);
    jest.mocked(axios.get).mockReset();
  });

  describe('createGqlOptions', () => {
    it('should build the federation 2 options served under any prefix', async () => {
      const options = await service.createGqlOptions();

      expect(options).toMatchObject({
        path: '/*splat/graphql',
        autoSchemaFile: { path: 'schema.gql', federation: MIND_FEDERATION_CONFIG },
        sortSchema: true,
        playground: false,
        status400ForVariableCoercionErrors: false,
        resolvers: { JSON: GraphQLJSON },
        resolverValidationOptions: { requireResolversToMatchSchema: 'ignore' },
      });
      expect(options.plugins).toHaveLength(1);
      expect(options.context).toEqual(expect.any(Function));
    });

    it('should declare the NestJS 10 federation link (v2.3, 11 directives) in the generated subgraph SDL', async () => {
      const options = await service.createGqlOptions();

      expect(federationLinkOf(options)).toBe(NEST_10_FEDERATION_LINK);
    });

    it('should use a path that Express 5 (path-to-regexp 8) accepts and that matches any prefix', async () => {
      const { path } = await service.createGqlOptions();

      const { regexp } = pathToRegexp(path, { end: false });
      expect(regexp.test('/user/graphql')).toBe(true);
      expect(regexp.test('/a/b/graphql')).toBe(true);
      expect(regexp.test('/user/graphql/x')).toBe(true);
      expect(regexp.test('/graphql')).toBe(false);
    });
  });

  describe('context', () => {
    const future = () => new Date(Date.now() + 60 * 60 * 1000).toISOString();

    it('should return an empty identity when there is no authorization header', async () => {
      await expect(resolveContext({})).resolves.toEqual({
        mindUserId: null,
        mindUserRoles: null,
        mindSessionExpiresIn: null,
      });
    });

    it('should fill the identity from a valid token whose session is still open', async () => {
      const mindSessionExpiresIn = future();
      const token = sign({ mindUserId: 'user-1', mindUserRoles: ['admin'], mindSessionExpiresIn });

      await expect(resolveContext({ authorization: `Bearer ${token}` })).resolves.toEqual({
        mindUserId: 'user-1',
        mindUserRoles: ['admin'],
        mindSessionExpiresIn,
      });
      expect(redis.get).toHaveBeenCalledWith('JWKS_PUBLIC_KEY');
      expect(axios.get).not.toHaveBeenCalled();
    });

    it('should keep the identity empty and log when the session has expired', async () => {
      const token = sign({
        mindUserId: 'user-1',
        mindUserRoles: ['admin'],
        mindSessionExpiresIn: '2000-01-01T00:00:00Z',
      });

      await expect(resolveContext({ authorization: `Bearer ${token}` })).resolves.toEqual({
        mindUserId: null,
        mindUserRoles: null,
        mindSessionExpiresIn: null,
      });
      expect(logger.error).toHaveBeenCalledWith(expect.stringMatching(/^Session Expired/), expect.any(String));
    });

    it('should download the JWKS and cache the public key in redis on a cache miss', async () => {
      redis.get.mockResolvedValue(null);
      process.env.JWKS_URL = 'https://example.com/.well-known/jwks.json';
      const jwk = { ...publicKey.export({ format: 'jwk' }), kid };
      jest.mocked(axios.get).mockResolvedValue({ data: { keys: [{ kid: 'other' }, jwk] } });
      const token = sign({ mindUserId: 'user-1', mindUserRoles: ['admin'], mindSessionExpiresIn: future() });

      const ctx = await resolveContext({ authorization: `Bearer ${token}` });

      expect(ctx).toMatchObject({ mindUserId: 'user-1' });
      expect(axios.get).toHaveBeenCalledWith('https://example.com/.well-known/jwks.json');
      expect(redis.set).toHaveBeenCalledWith('JWKS_PUBLIC_KEY', expect.stringContaining('PUBLIC KEY'), 'EX', 86400);
    });

    it('should resolve to undefined when the signature does not match the public key', async () => {
      const { privateKey: otherKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
      const token = jwt.sign({ mindUserId: 'user-1' }, otherKey, { algorithm: 'RS256', keyid: kid });

      await expect(resolveContext({ authorization: `Bearer ${token}` })).resolves.toBeUndefined();
      expect(logger.error).toHaveBeenCalledWith('Error setting context', expect.any(String), expect.any(Error));
    });

    it('should resolve to undefined when the token cannot be decoded', async () => {
      await expect(resolveContext({ authorization: 'Bearer not-a-jwt' })).resolves.toBeUndefined();
      expect(logger.error).toHaveBeenCalledWith('Error setting context', expect.any(String), expect.any(Error));
    });
  });
});
