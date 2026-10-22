import { Inject, Injectable } from '@nestjs/common';
import { GqlOptionsFactory } from '@nestjs/graphql';
import { ApolloFederationDriverConfig } from '@nestjs/apollo';
import { Redis } from 'ioredis';

import { MindLoggerService } from '../mind-logger/mind-logger.service';
import { MindLogger } from '../mind-logger/mind-logger.decorator';
import { logPrefix } from '../mind-logger/mind-logger.util';
import { buildMindGqlOptions } from './graphql-options.builder';

@Injectable()
export class GraphqlAuthGatewayService implements GqlOptionsFactory<ApolloFederationDriverConfig> {
  private ONE_DAY = 24 * 60 * 60;

  constructor(
    @MindLogger('GraphqlAuthGatewayService') private logger: MindLoggerService,
    @Inject('REDIS_CLIENT') private readonly redis: Redis,
  ) {}

  async createGqlOptions(): Promise<ApolloFederationDriverConfig> {
    return buildMindGqlOptions({ context: ({ req }) => this.mindHandleContext({ req }) });
  }

  private mindHandleContext({ req }) {
    const _log = logPrefix('mindHandleContext');

    const ctx = { mindUserId: null, mindUserRoles: null, mindSessionExpiresIn: null };
    try {
      if (req?.headers?.['mind-user-id']) {
        ctx.mindUserId = req?.headers?.['mind-user-id'];
        ctx.mindUserRoles = req?.headers?.['mind-user-roles']?.split(',') ?? [];
        ctx.mindSessionExpiresIn = new Date(req?.headers?.['mind-session-expires-in']);
      }
    } catch (e) {
      this.logger.error('Error setting context', _log, e);
      return;
    }
    return ctx;
  }
}
