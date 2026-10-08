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
import { isSessionRevoked } from '../mind-session/session.helper';
import { extractRequestInfo } from '../mind-session/request-info.helper';

@Injectable()
export class GraphqlAuthJwksService implements GqlOptionsFactory<ApolloFederationDriverConfig> {
  private ONE_DAY = 24 * 60 * 60;

  constructor(
    @MindLogger('GraphqlAuthJwksService') private logger: MindLoggerService,
    @Inject('REDIS_CLIENT') private readonly redis: Redis,
  ) {}

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
      mindRequestInfo: extractRequestInfo(req),
    };
    try {
      if (req?.headers?.authorization) {
        const token = req?.headers?.authorization.split('Bearer ')[1];
        if (token && token.length > 0) {
          const decodedToken = jwt.decode(token, { complete: true });
          if (!decodedToken) throw new Error('Error token in decoded');
          const kid = decodedToken.header.kid;

          const publicKey = await this.getPublicKey(kid);
          try {
            const decoded = jwt.verify(token, publicKey, { algorithms: ['RS256'] }) as jwt.JwtPayload;
            if (decoded.mindSessionExpiresIn) {
              const expiresIn = new Date(decoded.mindSessionExpiresIn);
              const now = new Date();
              if (expiresIn.getTime() > now.getTime()) {
                if (!(await this.isSessionAllowed(decoded.sid, _log))) return;
                ctx.mindUserId = decoded.mindUserId;
                ctx.mindUserRoles = decoded.mindUserRoles;
                ctx.mindSessionExpiresIn = decoded.mindSessionExpiresIn;
                ctx.mindSessionId = decoded.sid ?? null;
              } else {
                this.logger.error(`Session Expired: ${expiresIn.toISOString()} x ${now.toISOString()}`, _log);
              }
            }
          } catch (e) {
            this.logger.error('Error setting context', _log, e);
            return;
          }
        }
      }
    } catch (e) {
      this.logger.error('Error setting context', _log, e);
      return;
    }
    return ctx;
  }

  // Token with `sid`: checks the global revocation key (fail-closed if Redis fails).
  // Legacy token without `sid`: accepted during the transition, unless SESSION_REQUIRE_SID is true/1 (case-insensitive, trimmed).
  private async isSessionAllowed(sid: string | undefined, _log: string): Promise<boolean> {
    if (!sid) {
      if (/^(true|1)$/i.test((process.env.SESSION_REQUIRE_SID ?? '').trim())) {
        this.logger.error('Token without session id (sid) rejected', _log);
        return false;
      }
      this.logger.warn('Token without session id (sid): session cannot be revoked', _log);
      return true;
    }
    try {
      if (await isSessionRevoked(this.redis, sid)) {
        this.logger.error(`Session revoked: ${sid}`, _log);
        return false;
      }
      return true;
    } catch (e) {
      this.logger.error('Error checking session revocation (fail-closed)', _log, e);
      return false;
    }
  }
}
