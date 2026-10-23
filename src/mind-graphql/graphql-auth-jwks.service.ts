import * as jwt from 'jsonwebtoken';
import * as jwkToPem from 'jwk-to-pem';
import axios from 'axios';

import { Inject, Injectable } from '@nestjs/common';
import { GqlOptionsFactory } from '@nestjs/graphql';
import { ApolloFederationDriverConfig } from '@nestjs/apollo';
import { Redis } from 'ioredis';
import { ApolloServerPluginLandingPageLocalDefault } from '@apollo/server/plugin/landingPage/default';
import GraphQLJSON from 'graphql-type-json';

import { MindLoggerService } from '../mind-logger/mind-logger.service';
import { MindLogger } from '../mind-logger/mind-logger.decorator';
import { logPrefix } from '../mind-logger/mind-logger.util';
import { SessionCheck, checkSession, parseRequireSid } from '../mind-session/session.helper';
import { unauthenticatedError } from './unauthenticated.error';
import { extractRequestInfo } from '../mind-session/request-info.helper';

@Injectable()
export class GraphqlAuthJwksService implements GqlOptionsFactory<ApolloFederationDriverConfig> {
  private ONE_DAY = 24 * 60 * 60;
  private readonly requireSid: boolean;

  constructor(
    @MindLogger('GraphqlAuthJwksService') private logger: MindLoggerService,
    @Inject('REDIS_CLIENT') private readonly redis: Redis,
  ) {
    this.requireSid = parseRequireSid(process.env.SESSION_REQUIRE_SID);
  }

  async createGqlOptions(): Promise<ApolloFederationDriverConfig> {
    return {
      path: `/*/graphql`,
      autoSchemaFile: { path: 'schema.gql', federation: 2 },
      sortSchema: true,
      playground: false,
      plugins: [ApolloServerPluginLandingPageLocalDefault()],
      resolvers: { JSON: GraphQLJSON },
      context: ({ req }) => this.mindHandleContext({ req }),
    };
  }

  private async getPublicKey(kid) {
    const _log = logPrefix('getPublicKey', [kid]);

    let publicKey = await this.redis.get('JWKS_PUBLIC_KEY');
    if (!publicKey) {
      this.logger.debug(`Loading public key: ${process.env.JWKS_URL}`, _log);
      const jwksResponse = await axios.get(process.env.JWKS_URL);
      this.logger.debug('JWKS file downloaded', _log);

      const [firstKey] = jwksResponse.data.keys.filter((item) => item.kid === kid);
      publicKey = jwkToPem(firstKey);
      await this.redis.set('JWKS_PUBLIC_KEY', publicKey, 'EX', this.ONE_DAY);
      this.logger.debug('Public Key save in redis', _log);
    }
    return publicKey;
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
        const expiresIn = new Date(decoded.mindSessionExpiresIn);
        const now = new Date();
        if (expiresIn.getTime() > now.getTime()) {
          await this.assertSessionAllowed(decoded.sid, req, _log);
          ctx.mindUserId = decoded.mindUserId;
          ctx.mindUserRoles = decoded.mindUserRoles;
          ctx.mindSessionExpiresIn = decoded.mindSessionExpiresIn;
          ctx.mindSessionId = decoded.sid ?? null;
        } else {
          this.logger.error(`Session Expired: ${expiresIn.toISOString()} x ${now.toISOString()}`, _log);
        }
      }
    }
    ctx.mindRequestInfo = extractRequestInfo(req);
    return ctx;
  }

  private async verifyToken(token: string, _log: string): Promise<jwt.JwtPayload> {
    try {
      const decodedToken = jwt.decode(token, { complete: true });
      if (!decodedToken) throw new Error('Error token in decoded');
      const publicKey = await this.getPublicKey(decodedToken.header.kid);
      return jwt.verify(token, publicKey, { algorithms: ['RS256'] }) as jwt.JwtPayload;
    } catch (e) {
      this.logger.error('Error setting context', _log, e);
      throw unauthenticatedError('Invalid token');
    }
  }

  // Token with `sid`: checks the global revocation key (fail-closed if Redis fails).
  // Legacy token without the `sid` claim: accepted during the transition, unless SESSION_REQUIRE_SID is true.
  // A `sid` that is present but not a non-empty string is never legacy: it is rejected.
  private async assertSessionAllowed(sid: unknown, req: any, _log: string): Promise<void> {
    let check: SessionCheck;
    try {
      check = await checkSession(this.redis, sid, this.requireSid);
    } catch (e) {
      this.logger.error('Error checking session revocation (fail-closed)', _log, e);
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
