import axios from 'axios';
import * as jwkToPem from 'jwk-to-pem';
import * as jwt from 'jsonwebtoken';
import { pathToRegexp } from 'path-to-regexp';
import GraphQLJSON from 'graphql-type-json';

import { GraphqlAuthJwksService } from './graphql-auth-jwks.service';
import { getMindFederationConfig } from './graphql-federation.config';
import {
  EMPTY_IDENTITY,
  LoggerMock,
  NEST_10_FEDERATION_LINK,
  UNAUTHENTICATED,
  createLoggerMock,
  federationLinkOf,
} from './graphql-auth.spec-helper';
import { RsaKeys, createRedisMock, createRsaKeys, signToken } from './jwt.test-support';

// Stubs the scalar and GraphQLError instead of installing `graphql`; see graphql-auth.spec-helper.ts for the reason
jest.mock('graphql-type-json', () => ({ __esModule: true, default: { name: 'JSON' } }));
jest.mock('graphql', () => ({ GraphQLError: jest.requireActual('./graphql-auth.spec-helper').GraphQLErrorStub }), {
  virtual: true,
});
jest.mock('axios');
const mockedAxios = axios as jest.Mocked<typeof axios>;

describe('GraphqlAuthJwksService', () => {
  const keys: RsaKeys = createRsaKeys('kid-1');
  const otherKeys: RsaKeys = createRsaKeys('kid-1');
  const future = () => new Date(Date.now() + 3600_000).toISOString();
  const past = () => new Date(Date.now() - 3600_000).toISOString();

  let redis: ReturnType<typeof createRedisMock>;
  let logger: LoggerMock;
  let service: GraphqlAuthJwksService;
  let context: (arg: { req: any }) => Promise<any>;

  const reqWith = (token?: string, extra: Record<string, string> = {}) => ({
    headers: { ...(token ? { authorization: `Bearer ${token}` } : {}), 'user-agent': 'jest', ...extra },
  });
  const validPayload = (extra: Record<string, any> = {}) => ({
    mindUserId: 'u1',
    mindUserRoles: ['admin'],
    mindSessionExpiresIn: future(),
    ...extra,
  });

  beforeEach(async () => {
    process.env.JWKS_URL = 'http://jwks.test/jwks';
    delete process.env.SESSION_REQUIRE_SID;
    redis = createRedisMock();
    redis.get.mockResolvedValue(jwkToPem(keys.jwk as any)); // public key already cached
    redis.eval.mockResolvedValue(0); // session not revoked
    logger = createLoggerMock();
    mockedAxios.get.mockReset();
    await buildService();
  });

  // SESSION_REQUIRE_SID is read once, at construction
  const buildService = async () => {
    service = new GraphqlAuthJwksService(logger as any, redis as any);
    context = (await service.createGqlOptions()).context as any;
  };

  it('should expose request info even without Authorization header', async () => {
    const ctx = await context({ req: { ...reqWith(undefined, { 'x-forwarded-for': '1.2.3.4' }), ip: '203.0.113.7' } });

    expect(ctx.mindUserId).toBeNull();
    expect(ctx.mindRequestInfo.ip).toBe('203.0.113.7'); // never the client-supplied X-Forwarded-For
    expect(ctx.mindRequestInfo.userAgent).toBe('jest');
  });

  it('should return an empty identity when there is no authorization header', async () => {
    await expect(context({ req: { headers: {} } })).resolves.toEqual(EMPTY_IDENTITY);
  });

  it('should return an empty identity for a non-Bearer or empty token', async () => {
    const ctx = await context({ req: { headers: { authorization: 'Bearer ' } } });
    expect(ctx.mindUserId).toBeNull();

    const basic = await context({ req: { headers: { authorization: 'Basic x' } } });
    expect(basic.mindUserId).toBeNull();
  });

  it('should fill the identity and session id for a valid token with sid', async () => {
    const token = signToken(keys, validPayload({ sid: 'sess-1' }));

    const ctx = await context({ req: reqWith(token) });

    expect(ctx.mindUserId).toBe('u1');
    expect(ctx.mindUserRoles).toEqual(['admin']);
    expect(ctx.mindSessionId).toBe('sess-1');
    expect(ctx.mindSessionExpiresIn).toBeInstanceOf(Date);
    expect(redis.eval).toHaveBeenCalledWith(expect.stringContaining('EXISTS'), 0, 'mind:session:revoked:sess-1');
  });

  it('should reject with 401 UNAUTHENTICATED when the session is revoked, logging ip and user agent', async () => {
    redis.eval.mockResolvedValue(1);
    const token = signToken(keys, validPayload({ sid: 'sess-1' }));

    await expect(context({ req: { ...reqWith(token), ip: '203.0.113.7' } })).rejects.toMatchObject(UNAUTHENTICATED);
    expect(logger.error).toHaveBeenCalledWith(
      expect.stringMatching(/Session revoked: sess-1 \(ip: 203\.0\.113\.7, user-agent: jest\)/),
      expect.any(String),
    );
  });

  it('should fail closed when Redis fails during the revocation check', async () => {
    redis.eval.mockRejectedValue(new Error('redis down'));
    const token = signToken(keys, validPayload({ sid: 'sess-1' }));

    await expect(context({ req: reqWith(token) })).rejects.toMatchObject(UNAUTHENTICATED);
    expect(logger.error).toHaveBeenCalledWith(
      expect.stringContaining('fail-closed'),
      expect.any(String),
      expect.any(Error),
    );
  });

  describe('token without sid (transition)', () => {
    it('should accept (debug log only) when SESSION_REQUIRE_SID is not set', async () => {
      const token = signToken(keys, validPayload());

      const ctx = await context({ req: reqWith(token) });

      expect(ctx.mindUserId).toBe('u1');
      expect(ctx.mindSessionId).toBeNull();
      expect(logger.error).not.toHaveBeenCalled();
      expect(redis.eval).not.toHaveBeenCalled();
    });

    it.each(['false', '0', '', '  FALSE '])('should accept when SESSION_REQUIRE_SID is %j', async (value) => {
      process.env.SESSION_REQUIRE_SID = value;
      await buildService();
      const token = signToken(keys, validPayload());

      expect((await context({ req: reqWith(token) })).mindUserId).toBe('u1');
    });

    it.each(['true', 'TRUE', 'True', '1', ' true '])(
      'should reject with 401 when SESSION_REQUIRE_SID is %j',
      async (value) => {
        process.env.SESSION_REQUIRE_SID = value;
        await buildService();
        const token = signToken(keys, validPayload());

        await expect(context({ req: reqWith(token) })).rejects.toMatchObject(UNAUTHENTICATED);
      },
    );

    it.each(['yes', 'on', 'ture', '2'])('should fail at construction when SESSION_REQUIRE_SID is %j', (value) => {
      process.env.SESSION_REQUIRE_SID = value;
      expect(() => new GraphqlAuthJwksService(logger as any, redis as any)).toThrow(/Invalid SESSION_REQUIRE_SID/);
    });
  });

  describe('invalid sid claim', () => {
    it.each([
      ['empty string', ''],
      ['blank', '  '],
      ['number', 0],
      ['null', null],
      ['object', {}],
    ])('should reject (never treat as legacy) when sid is %s', async (_name, sid) => {
      const token = signToken(keys, validPayload({ sid }));

      await expect(context({ req: reqWith(token) })).rejects.toMatchObject(UNAUTHENTICATED);
      expect(redis.eval).not.toHaveBeenCalled();
    });
  });

  describe('token validation', () => {
    it('should reject a malformed token', async () => {
      await expect(context({ req: reqWith('not-a-jwt') })).rejects.toMatchObject(UNAUTHENTICATED);
    });

    it('should reject a token signed with another key', async () => {
      const token = signToken(otherKeys, validPayload({ sid: 's' }));
      await expect(context({ req: reqWith(token) })).rejects.toMatchObject(UNAUTHENTICATED);
    });

    it('should reject a token signed with an unexpected algorithm (HS256 with the public PEM)', async () => {
      const forged = jwt.sign(validPayload({ sid: 's' }), jwkToPem(keys.jwk as any), {
        algorithm: 'HS256',
        keyid: 'kid-1',
      });
      await expect(context({ req: reqWith(forged) })).rejects.toMatchObject(UNAUTHENTICATED);
    });

    it('should reject a validly signed token whose algorithm is not RS256', async () => {
      const token = signToken(keys, validPayload({ sid: 's' }), { algorithm: 'RS384' });
      await expect(context({ req: reqWith(token) })).rejects.toMatchObject(UNAUTHENTICATED);
    });

    it('should return an empty identity when mindSessionExpiresIn is in the past', async () => {
      const token = signToken(keys, validPayload({ sid: 's', mindSessionExpiresIn: past() }));

      const ctx = await context({ req: reqWith(token) });

      expect(ctx.mindUserId).toBeNull();
      expect(logger.error).toHaveBeenCalledWith(expect.stringContaining('Session Expired'), expect.any(String));
    });

    it('should return an empty identity when mindSessionExpiresIn is missing', async () => {
      const token = signToken(keys, { mindUserId: 'u1', sid: 's' });
      expect((await context({ req: reqWith(token) })).mindUserId).toBeNull();
    });
  });

  describe('public key loading', () => {
    it('should download the JWKS, convert to PEM and cache it when not cached', async () => {
      redis.get.mockResolvedValue(null);
      mockedAxios.get.mockResolvedValue({ data: { keys: [{ ...otherKeys.jwk, kid: 'x' }, keys.jwk] } });
      const token = signToken(keys, validPayload({ sid: 's' }));

      const ctx = await context({ req: reqWith(token) });

      expect(mockedAxios.get).toHaveBeenCalledWith('http://jwks.test/jwks');
      expect(redis.set).toHaveBeenCalledWith(
        'JWKS_PUBLIC_KEY',
        expect.stringContaining('BEGIN PUBLIC KEY'),
        'EX',
        86400,
      );
      expect(ctx.mindUserId).toBe('u1');
    });

    it('should not download when the key is cached', async () => {
      const token = signToken(keys, validPayload({ sid: 's' }));
      await context({ req: reqWith(token) });
      expect(mockedAxios.get).not.toHaveBeenCalled();
    });

    it('should reject when the JWKS request fails', async () => {
      redis.get.mockResolvedValue(null);
      mockedAxios.get.mockRejectedValue(new Error('network'));
      const token = signToken(keys, validPayload({ sid: 's' }));

      await expect(context({ req: reqWith(token) })).rejects.toMatchObject(UNAUTHENTICATED);
    });

    it('should reject when the kid is not in the JWKS', async () => {
      redis.get.mockResolvedValue(null);
      mockedAxios.get.mockResolvedValue({ data: { keys: [{ ...keys.jwk, kid: 'other' }] } });
      const token = signToken(keys, validPayload({ sid: 's' }));

      await expect(context({ req: reqWith(token) })).rejects.toMatchObject(UNAUTHENTICATED);
    });
  });

  describe('createGqlOptions', () => {
    it('should build the federation 2 options served under any prefix', async () => {
      const options = await service.createGqlOptions();

      expect(options).toMatchObject({
        path: '/*splat/graphql',
        autoSchemaFile: { path: 'schema.gql', federation: getMindFederationConfig() },
        sortSchema: true,
        playground: false,
        resolvers: { JSON: GraphQLJSON },
        resolverValidationOptions: { requireResolversToMatchSchema: 'warn' },
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
});
