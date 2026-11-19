import axios, { AxiosError } from 'axios';
import jwkToPem from 'jwk-to-pem';
import * as jwt from 'jsonwebtoken';
import { pathToRegexp } from 'path-to-regexp';
import GraphQLJSON from 'graphql-type-json';

import { GraphqlAuthJwksService } from './graphql-auth-jwks.service';
import { MindLoggerService } from '../mind-logger/mind-logger.service';
import { getMindFederationConfig } from './graphql-federation.config';
import {
  EMPTY_IDENTITY,
  LoggerMock,
  MIND_FEDERATION_LINK,
  UNAUTHENTICATED,
  createLoggerMock,
  federationLinkOf,
} from './graphql-auth.spec-helper';
import { RsaKeys, createRedisMock, createRsaKeys, signToken } from './jwt.test-support';

/** Stubs the scalar and GraphQLError instead of installing `graphql`; see graphql-auth.spec-helper.ts for the reason */
jest.mock('graphql-type-json', () => ({ __esModule: true, default: { name: 'JSON' } }));
jest.mock('graphql', () => ({ GraphQLError: jest.requireActual('./graphql-auth.spec-helper').GraphQLErrorStub }), {
  virtual: true,
});

const TOKEN_EXPIRED = { message: 'Token expired', ...UNAUTHENTICATED };
const INVALID_TOKEN = { message: 'Invalid token', ...UNAUTHENTICATED };

describe('GraphqlAuthJwksService', () => {
  const keys: RsaKeys = createRsaKeys('kid-1');
  const otherKeys: RsaKeys = createRsaKeys('kid-1');
  const future = () => new Date(Date.now() + 3600_000).toISOString();
  const past = () => new Date(Date.now() - 3600_000).toISOString();

  let redis: ReturnType<typeof createRedisMock>;
  let logger: LoggerMock;
  let service: GraphqlAuthJwksService;
  let context: (arg: { req: any }) => Promise<any>;
  /** A spy, not `jest.mock('axios')`: the logger's `jsonError` needs the real `axios.isAxiosError` */
  let axiosGet: jest.SpyInstance;

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
    axiosGet = jest.spyOn(axios, 'get').mockRejectedValue(new Error('JWKS download not stubbed'));
    await buildService();
  });

  afterEach(() => axiosGet.mockRestore());

  /** SESSION_REQUIRE_SID is read once, at construction */
  const buildService = async (serviceLogger: unknown = logger) => {
    service = new GraphqlAuthJwksService(serviceLogger as any, redis as any);
    context = (await service.createGqlOptions()).context as any;
  };

  /**
   * Builds the service with the real MindLoggerService, so `error()` runs `jsonError` and `JSON.stringify` as in a
   * service; only the winston logger behind it is replaced. Returns what would have been written.
   */
  const useRealLogger = async () => {
    const realLogger = new MindLoggerService();
    const sink = { log: jest.fn(), error: jest.fn(), warn: jest.fn(), debug: jest.fn(), verbose: jest.fn() };
    (realLogger as any).loggerService = sink;
    await buildService(realLogger);
    return () => JSON.stringify([sink.error.mock.calls, sink.debug.mock.calls]);
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
    expect(logger.error).toHaveBeenCalledWith(expect.stringContaining('fail-closed'), expect.any(String), {
      name: 'Error',
      message: 'redis down',
      code: undefined,
    });
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

    it('should return an empty identity for a validly signed token without mindSessionExpiresIn', async () => {
      process.env.SESSION_REQUIRE_SID = 'true';
      await buildService();
      const { mindSessionExpiresIn: _omitted, ...payload } = validPayload();

      await expect(context({ req: reqWith(signToken(keys, payload)) })).resolves.toEqual(EMPTY_IDENTITY);
      expect(redis.get).toHaveBeenCalledWith('JWKS_PUBLIC_KEY:kid-1');
      expect(redis.eval).not.toHaveBeenCalled();
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

    it('should reject with Token expired (401 UNAUTHENTICATED) when mindSessionExpiresIn is in the past', async () => {
      const token = signToken(keys, validPayload({ sid: 's', mindSessionExpiresIn: past() }));

      await expect(context({ req: reqWith(token) })).rejects.toMatchObject(TOKEN_EXPIRED);
      expect(logger.error).toHaveBeenCalledWith('Session expired', expect.any(String));
      expect(redis.eval).not.toHaveBeenCalled();
    });

    it('should reject with Token expired (401 UNAUTHENTICATED) when the exp claim is in the past', async () => {
      const token = signToken(keys, validPayload({ sid: 's', exp: Math.floor(Date.now() / 1000) - 60 }));

      await expect(context({ req: reqWith(token) })).rejects.toMatchObject(TOKEN_EXPIRED);
      expect(logger.error).toHaveBeenCalledWith('Token expired', expect.any(String));
    });

    it('should answer Invalid token, not Token expired, for an expired token signed with another key', async () => {
      const token = signToken(otherKeys, validPayload({ sid: 's', exp: Math.floor(Date.now() / 1000) - 60 }));

      await expect(context({ req: reqWith(token) })).rejects.toMatchObject(INVALID_TOKEN);
    });

    it('should reject with Invalid token when mindSessionExpiresIn is not a date', async () => {
      const token = signToken(keys, validPayload({ sid: 's', mindSessionExpiresIn: 'not-a-date' }));

      await expect(context({ req: reqWith(token) })).rejects.toMatchObject(INVALID_TOKEN);
    });

    it('should not log the token, the public key or the expiration claim when the session expired', async () => {
      const expiresAt = past();
      const token = signToken(keys, validPayload({ sid: 's', mindSessionExpiresIn: expiresAt }));

      await expect(context({ req: reqWith(token) })).rejects.toMatchObject(TOKEN_EXPIRED);

      const logged = JSON.stringify([logger.debug.mock.calls, logger.error.mock.calls]);
      expect(logged).not.toContain(token);
      expect(logged).not.toContain(expiresAt);
      expect(logged).not.toContain('PUBLIC KEY');
    });

    it('should return an empty identity when mindSessionExpiresIn is missing', async () => {
      const token = signToken(keys, { mindUserId: 'u1', sid: 's' });
      expect((await context({ req: reqWith(token) })).mindUserId).toBeNull();
    });
  });

  describe('public key loading (cache by kid)', () => {
    const newKeys: RsaKeys = createRsaKeys('kid-2');
    const ONE_MINUTE_MS = 60_000;

    let store: Map<string, string>;
    let clock: number;
    let nowSpy: jest.SpyInstance;

    /** Redis backed by a map, so what one request caches the next one reads */
    beforeEach(() => {
      store = new Map([['JWKS_PUBLIC_KEY:kid-1', jwkToPem(keys.jwk as any)]]);
      redis.get.mockImplementation(async (key: string) => store.get(key) ?? null);
      redis.set.mockImplementation(async (key: string, value: string) => {
        store.set(key, value);
        return 'OK';
      });
      clock = 1_000;
      nowSpy = jest.spyOn(performance, 'now').mockImplementation(() => clock);
      axiosGet.mockResolvedValue({ data: { keys: [keys.jwk, newKeys.jwk] } });
    });

    afterEach(() => nowSpy.mockRestore());

    it('should verify with the cached key of the token kid, without downloading the JWKS', async () => {
      const ctx = await context({ req: reqWith(signToken(keys, validPayload({ sid: 's' }))) });

      expect(ctx.mindUserId).toBe('u1');
      expect(redis.get).toHaveBeenCalledWith('JWKS_PUBLIC_KEY:kid-1');
      expect(axiosGet).not.toHaveBeenCalled();
    });

    it('should download the JWKS with a timeout and cache every key under JWKS_PUBLIC_KEY:<kid> for a day', async () => {
      store.clear();

      const ctx = await context({ req: reqWith(signToken(keys, validPayload({ sid: 's' }))) });

      expect(ctx.mindUserId).toBe('u1');
      expect(axiosGet).toHaveBeenCalledWith('http://jwks.test/jwks', { timeout: 5000 });
      expect(redis.set).toHaveBeenCalledWith(
        'JWKS_PUBLIC_KEY:kid-1',
        expect.stringContaining('BEGIN PUBLIC KEY'),
        'EX',
        86400,
      );
      expect(redis.set).toHaveBeenCalledWith('JWKS_PUBLIC_KEY:kid-2', jwkToPem(newKeys.jwk as any), 'EX', 86400);
    });

    it('should accept a token signed with a new kid (key rotation), downloading and caching the new key', async () => {
      const ctx = await context({ req: reqWith(signToken(newKeys, validPayload({ sid: 's' }))) });

      expect(ctx.mindUserId).toBe('u1');
      expect(axiosGet).toHaveBeenCalledTimes(1);
      expect(store.get('JWKS_PUBLIC_KEY:kid-2')).toBe(jwkToPem(newKeys.jwk as any));

      /** The old kid keeps working from its own cache entry */
      const old = await context({ req: reqWith(signToken(keys, validPayload({ sid: 's' }))) });
      expect(old.mindUserId).toBe('u1');
      expect(axiosGet).toHaveBeenCalledTimes(1);
    });

    it('should reject with Invalid token a kid that is not in the JWKS', async () => {
      const unknown = { ...keys, kid: 'unknown-kid' };

      await expect(context({ req: reqWith(signToken(unknown, validPayload({ sid: 's' }))) })).rejects.toMatchObject(
        INVALID_TOKEN,
      );
      expect(axiosGet).toHaveBeenCalledTimes(1);
      expect(store.has('JWKS_PUBLIC_KEY:unknown-kid')).toBe(false);
    });

    it('should not let a download triggered by an invented kid block a legitimate new kid', async () => {
      const invented = { ...keys, kid: 'invented' };
      await expect(context({ req: reqWith(signToken(invented, validPayload({ sid: 's' }))) })).rejects.toMatchObject(
        INVALID_TOKEN,
      );
      clock += 10_000;

      const ctx = await context({ req: reqWith(signToken(newKeys, validPayload({ sid: 's' }))) });

      expect(ctx.mindUserId).toBe('u1');
      expect(axiosGet).toHaveBeenCalledTimes(1);
    });

    it('should serve the keys of the last download within the minute even when Redis fails to cache them', async () => {
      redis.set.mockRejectedValue(new Error('redis down'));
      const invented = { ...keys, kid: 'invented' };
      await expect(context({ req: reqWith(signToken(invented, validPayload({ sid: 's' }))) })).rejects.toMatchObject(
        INVALID_TOKEN,
      );

      const ctx = await context({ req: reqWith(signToken(newKeys, validPayload({ sid: 's' }))) });

      expect(ctx.mindUserId).toBe('u1');
      expect(axiosGet).toHaveBeenCalledTimes(1);
      expect(logger.error).toHaveBeenCalledWith('Error caching the JWKS public keys', expect.any(String), {
        name: 'Error',
        message: 'redis down',
        code: undefined,
      });
    });

    it('should download the JWKS at most once per minute per replica', async () => {
      const unknownToken = signToken({ ...keys, kid: 'unknown-kid' }, validPayload({ sid: 's' }));

      await expect(context({ req: reqWith(unknownToken) })).rejects.toMatchObject(INVALID_TOKEN);
      clock += ONE_MINUTE_MS - 1;
      await expect(context({ req: reqWith(unknownToken) })).rejects.toMatchObject(INVALID_TOKEN);
      expect(axiosGet).toHaveBeenCalledTimes(1);

      clock += 1;
      await expect(context({ req: reqWith(unknownToken) })).rejects.toMatchObject(INVALID_TOKEN);
      expect(axiosGet).toHaveBeenCalledTimes(2);
    });

    it('should share a single download among concurrent requests with the same unknown kid', async () => {
      let release: (value: unknown) => void;
      axiosGet.mockReturnValue(new Promise((resolve) => (release = resolve)));
      const token = signToken(newKeys, validPayload({ sid: 's' }));

      const pending = Promise.all([1, 2, 3, 4, 5].map(() => context({ req: reqWith(token) })));
      await new Promise((resolve) => setImmediate(resolve));
      release({ data: { keys: [keys.jwk, newKeys.jwk] } });

      const contexts = await pending;
      expect(contexts.map((ctx) => ctx.mindUserId)).toEqual(['u1', 'u1', 'u1', 'u1', 'u1']);
      expect(axiosGet).toHaveBeenCalledTimes(1);
    });

    it('should reject with Invalid token when the download times out, without retrying within the minute', async () => {
      const written = await useRealLogger();
      /** A real AxiosError without `response`, logged through the real logger */
      axiosGet.mockRejectedValue(new AxiosError('timeout of 5000ms exceeded', 'ECONNABORTED'));
      const token = signToken(newKeys, validPayload({ sid: 's' }));

      await expect(context({ req: reqWith(token) })).rejects.toMatchObject(INVALID_TOKEN);
      expect(axiosGet).toHaveBeenCalledWith('http://jwks.test/jwks', { timeout: 5000 });
      expect(written()).toContain(
        'Error setting context | {\\"name\\":\\"AxiosError\\",\\"message\\":\\"timeout of 5000ms exceeded\\",\\"code\\":\\"ECONNABORTED\\"}',
      );

      clock += 30_000;
      await expect(context({ req: reqWith(token) })).rejects.toMatchObject(INVALID_TOKEN);
      expect(axiosGet).toHaveBeenCalledTimes(1);

      clock += 30_000;
      axiosGet.mockResolvedValue({ data: { keys: [newKeys.jwk] } });
      expect((await context({ req: reqWith(token) })).mindUserId).toBe('u1');
      expect(axiosGet).toHaveBeenCalledTimes(2);
    });

    it('should reject with Invalid token when Redis fails to read the key, without logging the client kid', async () => {
      const written = await useRealLogger();
      /** ioredis attaches the command, with the key built from the client kid, to its reply errors */
      redis.get.mockRejectedValue(
        Object.assign(new Error('NOPERM this user has no permissions to access one of the keys'), {
          command: { name: 'get', args: ['JWKS_PUBLIC_KEY:attacker-kid'] },
        }),
      );
      const token = signToken({ ...keys, kid: 'attacker-kid' }, validPayload({ sid: 's' }));

      await expect(context({ req: reqWith(token) })).rejects.toMatchObject(INVALID_TOKEN);
      expect(written()).toContain('Error reading the cached JWKS key');
      expect(written()).not.toContain('attacker-kid');
      expect(written()).not.toContain('NOPERM');
      expect(axiosGet).not.toHaveBeenCalled();
    });

    it('should not log the public key when Redis fails to cache it', async () => {
      const written = await useRealLogger();
      const pem = jwkToPem(newKeys.jwk as any);
      redis.set.mockRejectedValue(
        Object.assign(new Error('NOPERM this user has no permissions to access one of the keys'), {
          command: { name: 'set', args: ['JWKS_PUBLIC_KEY:kid-2', pem, 'EX', '86400'] },
        }),
      );

      const ctx = await context({ req: reqWith(signToken(newKeys, validPayload({ sid: 's' }))) });

      expect(ctx.mindUserId).toBe('u1');
      expect(written()).toContain('Error caching the JWKS public keys');
      expect(written()).not.toContain('PUBLIC KEY');
      expect(written()).not.toContain(pem.split('\n')[1]);
    });

    it('should reject with Invalid token a token without kid, without reading the cache or downloading', async () => {
      const token = jwt.sign(validPayload({ sid: 's' }), keys.privateKeyPem, { algorithm: 'RS256' });

      await expect(context({ req: reqWith(token) })).rejects.toMatchObject(INVALID_TOKEN);
      expect(redis.get).not.toHaveBeenCalled();
      expect(axiosGet).not.toHaveBeenCalled();
    });

    it('should reject with Invalid token when the JWKS document has no keys array', async () => {
      axiosGet.mockResolvedValue({ data: { notKeys: [] } });

      await expect(context({ req: reqWith(signToken(newKeys, validPayload({ sid: 's' }))) })).rejects.toMatchObject(
        INVALID_TOKEN,
      );
    });

    it('should cache only usable RSA signing keys and drop a kid repeated in the JWKS', async () => {
      const repeated = createRsaKeys('dup');
      axiosGet.mockResolvedValue({
        data: {
          keys: [
            newKeys.jwk,
            { ...otherKeys.jwk, kid: 'enc-key', use: 'enc' },
            { kty: 'EC', kid: 'ec-key', crv: 'P-256', x: 'x', y: 'y' },
            { ...otherKeys.jwk, kid: undefined },
            { kty: 'RSA', kid: 'broken', e: 'AQAB' },
            null,
            repeated.jwk,
            { ...otherKeys.jwk, kid: 'dup' },
            { ...otherKeys.jwk, kid: 'dup' },
          ],
        },
      });

      await expect(context({ req: reqWith(signToken(repeated, validPayload({ sid: 's' }))) })).rejects.toMatchObject(
        INVALID_TOKEN,
      );

      expect([...store.keys()].sort()).toEqual(['JWKS_PUBLIC_KEY:kid-1', 'JWKS_PUBLIC_KEY:kid-2']);
      expect(logger.error).toHaveBeenCalledWith(
        'JWKS keys ignored: 5 unusable, 1 repeated key id(s)',
        expect.any(String),
      );
    });

    it('should never put the client kid, the token or a key in the log', async () => {
      const token = signToken({ ...keys, kid: 'attacker-kid' }, validPayload({ sid: 's' }));

      await expect(context({ req: reqWith(token) })).rejects.toMatchObject(INVALID_TOKEN);

      const logged = JSON.stringify([logger.debug.mock.calls, logger.error.mock.calls]);
      expect(logged).not.toContain('attacker-kid');
      expect(logged).not.toContain(token);
      expect(logged).not.toContain('PUBLIC KEY');
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

    it('should declare the federation v2.14 link (13 directives) in the generated subgraph SDL', async () => {
      const options = await service.createGqlOptions();

      expect(federationLinkOf(options)).toBe(MIND_FEDERATION_LINK);
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
