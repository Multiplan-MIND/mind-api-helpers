import * as jwt from 'jsonwebtoken';
import jwkToPem from 'jwk-to-pem';
import axios from 'axios';

import { Inject, Injectable } from '@nestjs/common';
import { GqlOptionsFactory } from '@nestjs/graphql';
import { ApolloFederationDriverConfig } from '@nestjs/apollo';
import { Redis } from 'ioredis';

import { MindLoggerService } from '../mind-logger/mind-logger.service';
import { MindLogger } from '../mind-logger/mind-logger.decorator';
import { logPrefix } from '../mind-logger/mind-logger.util';
import { toError } from '../mind-helpers/error.helper';
import { SessionCheck, checkSession, parseRequireSid } from '../mind-session/session.helper';
import { buildMindGqlOptions } from './graphql-options.builder';
import { unauthenticatedError } from './unauthenticated.error';
import { extractRequestInfo } from '../mind-session/request-info.helper';

/** Redis key prefix of the public key (PEM) of each `kid` published in the JWKS */
const PUBLIC_KEY_CACHE_PREFIX = 'JWKS_PUBLIC_KEY:';
/** Minimum interval between two JWKS downloads in the same replica */
const JWKS_REFRESH_INTERVAL_MS = 60_000;
const JWKS_TIMEOUT_MS = 5_000;

/** Public key (PEM) by `kid` */
type JwksKeys = Map<string, string>;

/** `use` is optional in a JWK; when present it must say the key signs */
const isSigningRsaKey = (jwk: any): boolean => jwk?.kty === 'RSA' && (jwk.use === undefined || jwk.use === 'sig');

/**
 * What is logged of a caught error: name, message and code only. ioredis attaches `command.args` (cache keys with the
 * client `kid`, PEMs) and axios the request and the response, which the logger would serialize.
 */
const errorSummary = (e: unknown) => {
  const { name, message, code } = toError(e);
  return { name, message, code };
};

@Injectable()
export class GraphqlAuthJwksService implements GqlOptionsFactory<ApolloFederationDriverConfig> {
  private ONE_DAY = 24 * 60 * 60;
  private readonly requireSid: boolean;
  /** Last JWKS download of this replica (in flight or settled); `performance.now()` is monotonic */
  private jwksRefresh: { startedAt: number; keys: Promise<JwksKeys> } | null = null;

  constructor(
    @MindLogger('GraphqlAuthJwksService') private logger: MindLoggerService,
    @Inject('REDIS_CLIENT') private readonly redis: Redis,
  ) {
    this.requireSid = parseRequireSid(process.env.SESSION_REQUIRE_SID);
  }

  async createGqlOptions(): Promise<ApolloFederationDriverConfig> {
    return buildMindGqlOptions({
      /** Serves /<any prefix>/graphql; Express 5 (path-to-regexp 8) requires a named wildcard */
      path: '/*splat/graphql',
      context: ({ req }) => this.mindHandleContext({ req }),
    });
  }

  /**
   * A token without `kid` is rejected: with more than one key in the JWKS (a rotation) there is no unambiguous key
   * to verify it with. The `kid` comes from the client, so it is never logged.
   */
  private async getPublicKey(kid: unknown, _log: string): Promise<string> {
    if (typeof kid !== 'string' || kid.length === 0) throw new Error('Token without key id (kid)');

    let cached: string | null;
    try {
      cached = await this.redis.get(`${PUBLIC_KEY_CACHE_PREFIX}${kid}`);
    } catch {
      /** Without `cause`: the ioredis error carries the key, built from the client `kid` */
      throw new Error('Error reading the cached JWKS key');
    }
    if (cached) return cached;

    const publicKey = (await this.refreshJwks(_log)).get(kid);
    if (!publicKey) throw new Error('Key id (kid) not found in the JWKS');
    return publicKey;
  }

  /**
   * At most one download per JWKS_REFRESH_INTERVAL_MS in this replica: within the interval every caller, concurrent
   * or not, gets the same result (failure included), so a flood of unknown `kid`s cannot flood JWKS_URL. The result
   * holds every key of the JWKS, so a download triggered by an invented `kid` also brings a new legitimate key.
   */
  private refreshJwks(_log: string): Promise<JwksKeys> {
    const now = performance.now();
    if (this.jwksRefresh && now - this.jwksRefresh.startedAt < JWKS_REFRESH_INTERVAL_MS) {
      return this.jwksRefresh.keys;
    }
    const keys = this.downloadJwks(_log);
    this.jwksRefresh = { startedAt: now, keys };
    return keys;
  }

  private async downloadJwks(_log: string): Promise<JwksKeys> {
    this.logger.debug(`Downloading JWKS: ${process.env.JWKS_URL}`, _log);
    const { data } = await axios.get(process.env.JWKS_URL, { timeout: JWKS_TIMEOUT_MS });
    if (!Array.isArray(data?.keys)) throw new Error('Invalid JWKS document: missing keys');

    const keys = this.toPublicKeys(data.keys, _log);
    await this.cachePublicKeys(keys, _log);
    this.logger.debug(`JWKS downloaded: ${keys.size} signing key(s)`, _log);
    return keys;
  }

  /**
   * Keeps the RSA signing keys that have a `kid`, built from `n` and `e` only. A `kid` repeated in the JWKS is dropped:
   * there is no unambiguous key for it.
   */
  private toPublicKeys(jwks: any[], _log: string): JwksKeys {
    const keys: JwksKeys = new Map();
    const repeated = new Set<string>();
    let skipped = 0;

    for (const jwk of jwks) {
      const kid = jwk?.kid;
      if (!isSigningRsaKey(jwk) || typeof kid !== 'string' || kid.length === 0) {
        skipped++;
      } else if (keys.has(kid) || repeated.has(kid)) {
        repeated.add(kid);
        keys.delete(kid);
      } else {
        try {
          keys.set(kid, jwkToPem({ kty: 'RSA', n: jwk.n, e: jwk.e }));
        } catch {
          skipped++;
        }
      }
    }

    if (skipped > 0 || repeated.size > 0) {
      this.logger.error(`JWKS keys ignored: ${skipped} unusable, ${repeated.size} repeated key id(s)`, _log);
    }
    return keys;
  }

  /** Best effort: the keys just downloaded still serve this replica if Redis fails */
  private async cachePublicKeys(keys: JwksKeys, _log: string): Promise<void> {
    try {
      await Promise.all(
        [...keys].map(([kid, pem]) => this.redis.set(`${PUBLIC_KEY_CACHE_PREFIX}${kid}`, pem, 'EX', this.ONE_DAY)),
      );
    } catch (e) {
      this.logger.error('Error caching the JWKS public keys', _log, errorSummary(e));
    }
  }

  private async mindHandleContext({ req }) {
    const _log = logPrefix('mindHandleContext');

    const ctx = {
      mindUserId: null,
      mindUserRoles: null,
      mindSessionExpiresIn: null,
      mindSessionId: null,
      mindRequestInfo: null,
    };

    const token = req?.headers?.authorization?.split('Bearer ')[1];
    if (token && token.length > 0) {
      const decoded = await this.verifyToken(token, _log);
      if (decoded.mindSessionExpiresIn) {
        const expiresIn = this.assertSessionNotExpired(decoded.mindSessionExpiresIn, _log);
        await this.assertSessionAllowed(decoded.sid, req, _log);
        ctx.mindUserId = decoded.mindUserId;
        ctx.mindUserRoles = decoded.mindUserRoles;
        ctx.mindSessionExpiresIn = expiresIn;
        ctx.mindSessionId = decoded.sid ?? null;
      }
    }
    ctx.mindRequestInfo = extractRequestInfo(req);
    return ctx;
  }

  /** `Token expired` tells the client to renew the session; the claim value is not logged */
  private assertSessionNotExpired(mindSessionExpiresIn: unknown, _log: string): Date {
    const expiresIn = new Date(mindSessionExpiresIn as string);
    if (Number.isNaN(expiresIn.getTime())) {
      this.logger.error('Token with invalid session expiration rejected', _log);
      throw unauthenticatedError('Invalid token');
    }
    if (expiresIn.getTime() <= Date.now()) {
      this.logger.error('Session expired', _log);
      throw unauthenticatedError('Token expired');
    }
    return expiresIn;
  }

  /**
   * `jwt.verify` checks the signature before `exp`, so `Token expired` is only answered for a token this issuer
   * signed. The error is not logged: `TokenExpiredError` carries the `exp` claim.
   */
  private async verifyToken(token: string, _log: string): Promise<jwt.JwtPayload> {
    try {
      const decodedToken = jwt.decode(token, { complete: true });
      if (!decodedToken) throw new Error('Error token in decoded');
      const publicKey = await this.getPublicKey(decodedToken.header.kid, _log);
      return jwt.verify(token, publicKey, { algorithms: ['RS256'] }) as jwt.JwtPayload;
    } catch (e) {
      if (e instanceof jwt.TokenExpiredError) {
        this.logger.error('Token expired', _log);
        throw unauthenticatedError('Token expired');
      }
      this.logger.error('Error setting context', _log, errorSummary(e));
      throw unauthenticatedError('Invalid token');
    }
  }

  /**
   * Token with `sid`: checks the global revocation key (fail-closed if Redis fails).
   * Legacy token without the `sid` claim: accepted during the transition, unless SESSION_REQUIRE_SID is true.
   * A `sid` that is present but not a non-empty string is never legacy: it is rejected.
   */
  private async assertSessionAllowed(sid: unknown, req: any, _log: string): Promise<void> {
    let check: SessionCheck;
    try {
      check = await checkSession(this.redis, sid, this.requireSid);
    } catch (e) {
      this.logger.error('Error checking session revocation (fail-closed)', _log, errorSummary(e));
      throw unauthenticatedError('Unable to validate session');
    }

    switch (check) {
      case 'legacy':
        this.logger.debug('Token without session id (sid): session cannot be revoked', _log);
        return;
      case 'sid-required':
        this.logger.error('Token without session id (sid) rejected', _log);
        throw unauthenticatedError('Session id required');
      case 'invalid-sid':
        this.logger.error('Token with invalid session id (sid) rejected', _log);
        throw unauthenticatedError('Invalid token');
      case 'revoked': {
        const { ip, userAgent } = extractRequestInfo(req);
        this.logger.error(`Session revoked: ${sid} (ip: ${ip}, user-agent: ${userAgent})`, _log);
        throw unauthenticatedError('Session revoked');
      }
    }
  }
}
