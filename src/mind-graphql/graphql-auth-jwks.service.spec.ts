import axios from 'axios';
import * as jwkToPem from 'jwk-to-pem';
import * as jwt from 'jsonwebtoken';

import { GraphqlAuthJwksService } from './graphql-auth-jwks.service';
import { RsaKeys, createLoggerMock, createRedisMock, createRsaKeys, signToken } from './jwt.test-support';

// `graphql` is a peer of graphql-type-json and is not installed in this package.
jest.mock('graphql-type-json', () => ({ __esModule: true, default: {} }));
jest.mock('axios');
const mockedAxios = axios as jest.Mocked<typeof axios>;

describe('GraphqlAuthJwksService', () => {
  const keys: RsaKeys = createRsaKeys('kid-1');
  const otherKeys: RsaKeys = createRsaKeys('kid-1');
  const future = () => new Date(Date.now() + 3600_000).toISOString();
  const past = () => new Date(Date.now() - 3600_000).toISOString();

  let redis: ReturnType<typeof createRedisMock>;
  let logger: ReturnType<typeof createLoggerMock>;
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
    service = new GraphqlAuthJwksService(logger as any, redis as any);
    context = (await service.createGqlOptions()).context as any;
  });

  it('should expose request info even without Authorization header', async () => {
    const ctx = await context({ req: reqWith(undefined, { 'x-forwarded-for': '203.0.113.7' }) });

    expect(ctx.mindUserId).toBeNull();
    expect(ctx.mindRequestInfo.ip).toBe('203.0.113.7');
    expect(ctx.mindRequestInfo.userAgent).toBe('jest');
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
    expect(redis.eval).toHaveBeenCalledWith(expect.stringContaining('EXISTS'), 0, 'mind:session:revoked:sess-1');
  });

  it('should reject (undefined context) when the session is revoked', async () => {
    redis.eval.mockResolvedValue(1);
    const token = signToken(keys, validPayload({ sid: 'sess-1' }));

    await expect(context({ req: reqWith(token) })).resolves.toBeUndefined();
    expect(redis.eval).toHaveBeenCalled();
    expect(logger.error).toHaveBeenCalledWith(expect.stringContaining('Session revoked'), expect.any(String));
  });

  it('should fail closed when Redis fails during the revocation check', async () => {
    redis.eval.mockRejectedValue(new Error('redis down'));
    const token = signToken(keys, validPayload({ sid: 'sess-1' }));

    await expect(context({ req: reqWith(token) })).resolves.toBeUndefined();
    expect(logger.error).toHaveBeenCalled();
  });

  describe('token without sid (transition)', () => {
    it('should accept with a warning when SESSION_REQUIRE_SID is not true', async () => {
      const token = signToken(keys, validPayload());

      const ctx = await context({ req: reqWith(token) });

      expect(ctx.mindUserId).toBe('u1');
      expect(ctx.mindSessionId).toBeNull();
      expect(logger.warn).toHaveBeenCalled();
      expect(redis.eval).not.toHaveBeenCalled();
    });

    it('should accept when SESSION_REQUIRE_SID is "false"', async () => {
      process.env.SESSION_REQUIRE_SID = 'false';
      const token = signToken(keys, validPayload());

      expect((await context({ req: reqWith(token) })).mindUserId).toBe('u1');
    });

    it('should reject when SESSION_REQUIRE_SID is "true"', async () => {
      process.env.SESSION_REQUIRE_SID = 'true';
      const token = signToken(keys, validPayload());

      await expect(context({ req: reqWith(token) })).resolves.toBeUndefined();
    });

    it.each(['TRUE', 'True', '1', ' true '])('should reject when SESSION_REQUIRE_SID is %j', async (value) => {
      process.env.SESSION_REQUIRE_SID = value;
      const token = signToken(keys, validPayload());

      await expect(context({ req: reqWith(token) })).resolves.toBeUndefined();
    });

    it.each(['false', '0', '', 'yes'])('should stay lenient when SESSION_REQUIRE_SID is %j', async (value) => {
      process.env.SESSION_REQUIRE_SID = value;
      const token = signToken(keys, validPayload());

      expect((await context({ req: reqWith(token) })).mindUserId).toBe('u1');
    });
  });

  describe('token validation', () => {
    it('should reject a malformed token', async () => {
      await expect(context({ req: reqWith('not-a-jwt') })).resolves.toBeUndefined();
    });

    it('should reject a token signed with another key', async () => {
      const token = signToken(otherKeys, validPayload({ sid: 's' }));
      await expect(context({ req: reqWith(token) })).resolves.toBeUndefined();
    });

    it('should reject a token signed with an unexpected algorithm (HS256 with the public PEM)', async () => {
      const forged = jwt.sign(validPayload({ sid: 's' }), jwkToPem(keys.jwk as any), {
        algorithm: 'HS256',
        keyid: 'kid-1',
      });
      await expect(context({ req: reqWith(forged) })).resolves.toBeUndefined();
    });

    it('should reject a validly signed token whose algorithm is not RS256', async () => {
      const token = signToken(keys, validPayload({ sid: 's' }), { algorithm: 'RS384' });
      await expect(context({ req: reqWith(token) })).resolves.toBeUndefined();
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

      await expect(context({ req: reqWith(token) })).resolves.toBeUndefined();
    });

    it('should reject when the kid is not in the JWKS', async () => {
      redis.get.mockResolvedValue(null);
      mockedAxios.get.mockResolvedValue({ data: { keys: [{ ...keys.jwk, kid: 'other' }] } });
      const token = signToken(keys, validPayload({ sid: 's' }));

      await expect(context({ req: reqWith(token) })).resolves.toBeUndefined();
    });
  });

  it('should expose the federation options', async () => {
    const options = await service.createGqlOptions();
    expect(options.path).toBe('/*/graphql');
    expect(options.playground).toBe(false);
  });
});
