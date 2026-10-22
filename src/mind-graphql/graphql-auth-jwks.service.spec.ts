import { generateKeyPairSync, KeyObject } from 'crypto';
import * as jwt from 'jsonwebtoken';
import axios from 'axios';
import { pathToRegexp } from 'path-to-regexp';
import GraphQLJSON from 'graphql-type-json';

import { GraphqlAuthJwksService } from './graphql-auth-jwks.service';
import { createLoggerMock, EMPTY_IDENTITY, LoggerMock, resolveContext } from './graphql-auth.spec-helper';

jest.mock('axios');
// Stubs the scalar instead of installing `graphql`; see graphql-auth.spec-helper.ts for the reason
jest.mock('graphql-type-json', () => ({ __esModule: true, default: { name: 'JSON' } }));
type RedisMock = { get: jest.Mock; set: jest.Mock };

describe('GraphqlAuthJwksService', () => {
  const kid = 'test-kid';
  let privateKey: KeyObject;
  let publicKey: KeyObject;
  let publicPem: string;
  let otherPrivateKey: KeyObject;

  let logger: LoggerMock;
  let redis: RedisMock;
  let service: GraphqlAuthJwksService;

  const sign = (payload: object) => jwt.sign(payload, privateKey, { algorithm: 'RS256', keyid: kid });

  beforeAll(() => {
    ({ privateKey, publicKey } = generateKeyPairSync('rsa', { modulusLength: 2048 }));
    publicPem = publicKey.export({ type: 'spki', format: 'pem' }).toString();
    ({ privateKey: otherPrivateKey } = generateKeyPairSync('rsa', { modulusLength: 2048 }));
  });

  beforeEach(() => {
    logger = createLoggerMock();
    redis = { get: jest.fn().mockResolvedValue(publicPem), set: jest.fn().mockResolvedValue('OK') };
    service = new GraphqlAuthJwksService(logger as any, redis as any);
    jest.mocked(axios.get).mockReset();
  });

  describe('createGqlOptions', () => {
    it('should build the federation 2 options served under any prefix', async () => {
      const options = await service.createGqlOptions();

      expect(options).toMatchObject({
        path: '/*splat/graphql',
        autoSchemaFile: { path: 'schema.gql', federation: 2 },
        sortSchema: true,
        playground: false,
        resolvers: { JSON: GraphQLJSON },
        resolverValidationOptions: { requireResolversToMatchSchema: 'warn' },
      });
      expect(options.plugins).toHaveLength(1);
      expect(options.context).toEqual(expect.any(Function));
    });

    it('should use a path that Express 5 (path-to-regexp 8) accepts and that matches any prefix', async () => {
      const { path } = await service.createGqlOptions();

      const { regexp } = pathToRegexp(path, { end: false });
      expect(regexp.test('/user/graphql')).toBe(true);
      expect(regexp.test('/a/b/graphql')).toBe(true);
      expect(regexp.test('/graphql')).toBe(false);
    });
  });

  describe('context', () => {
    const future = () => new Date(Date.now() + 60 * 60 * 1000).toISOString();

    it('should return an empty identity when there is no authorization header', async () => {
      await expect(resolveContext(service, {})).resolves.toEqual(EMPTY_IDENTITY);
    });

    it('should fill the identity from a valid token whose session is still open', async () => {
      const mindSessionExpiresIn = future();
      const token = sign({ mindUserId: 'user-1', mindUserRoles: ['admin'], mindSessionExpiresIn });

      await expect(resolveContext(service, { authorization: `Bearer ${token}` })).resolves.toEqual({
        mindUserId: 'user-1',
        mindUserRoles: ['admin'],
        mindSessionExpiresIn: new Date(mindSessionExpiresIn),
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

      await expect(resolveContext(service, { authorization: `Bearer ${token}` })).resolves.toEqual(EMPTY_IDENTITY);
      expect(logger.error).toHaveBeenCalledWith(expect.stringMatching(/^Session Expired/), expect.any(String));
    });

    it('should download the JWKS and cache the public key in redis on a cache miss', async () => {
      redis.get.mockResolvedValue(null);
      process.env.JWKS_URL = 'https://example.com/.well-known/jwks.json';
      const jwk = { ...publicKey.export({ format: 'jwk' }), kid };
      jest.mocked(axios.get).mockResolvedValue({ data: { keys: [{ kid: 'other' }, jwk] } });
      const token = sign({ mindUserId: 'user-1', mindUserRoles: ['admin'], mindSessionExpiresIn: future() });

      const ctx = await resolveContext(service, { authorization: `Bearer ${token}` });

      expect(ctx).toMatchObject({ mindUserId: 'user-1' });
      expect(axios.get).toHaveBeenCalledWith('https://example.com/.well-known/jwks.json');
      expect(redis.set).toHaveBeenCalledWith('JWKS_PUBLIC_KEY', expect.stringContaining('PUBLIC KEY'), 'EX', 86400);
    });

    it('should resolve to undefined when the signature does not match the public key', async () => {
      const token = jwt.sign({ mindUserId: 'user-1' }, otherPrivateKey, { algorithm: 'RS256', keyid: kid });

      await expect(resolveContext(service, { authorization: `Bearer ${token}` })).resolves.toBeUndefined();
      expect(logger.error).toHaveBeenCalledWith('Error setting context', expect.any(String), expect.any(Error));
    });

    it('should resolve to undefined when the token cannot be decoded', async () => {
      await expect(resolveContext(service, { authorization: 'Bearer not-a-jwt' })).resolves.toBeUndefined();
      expect(logger.error).toHaveBeenCalledWith('Error setting context', expect.any(String), expect.any(Error));
    });
  });
});
