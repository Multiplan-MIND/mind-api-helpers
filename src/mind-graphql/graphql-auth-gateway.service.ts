import { Inject, Injectable } from '@nestjs/common';
import { GqlOptionsFactory } from '@nestjs/graphql';
import { ApolloFederationDriverConfig } from '@nestjs/apollo';
import { Redis } from 'ioredis';
import { ApolloServerPluginLandingPageLocalDefault } from '@apollo/server/plugin/landingPage/default';
import GraphQLJSON from 'graphql-type-json';

import { MindLoggerService } from '../mind-logger/mind-logger.service';
import { MindLogger } from '../mind-logger/mind-logger.decorator';
import { logPrefix } from '../mind-logger/mind-logger.util';

@Injectable()
export class GraphqlAuthGatewayService implements GqlOptionsFactory<ApolloFederationDriverConfig> {
  private ONE_DAY = 24 * 60 * 60;

  constructor(
    @MindLogger('GraphqlAuthGatewayService') private logger: MindLoggerService,
    @Inject('REDIS_CLIENT') private readonly redis: Redis,
  ) {}

  async createGqlOptions(): Promise<ApolloFederationDriverConfig> {
    return {
      autoSchemaFile: { path: 'schema.gql', federation: 2 },
      sortSchema: true,
      playground: false,
      // Apollo Server 5 answers variable coercion errors with 400; keep the Apollo Server 4 status (200)
      status400ForVariableCoercionErrors: false,
      plugins: [ApolloServerPluginLandingPageLocalDefault()],
      resolvers: { JSON: GraphQLJSON },
      // @nestjs/graphql 13 validates the resolver map against the federated schema; keep ignoring `JSON` when no
      // field uses it, as @nestjs/graphql 12 did
      resolverValidationOptions: { requireResolversToMatchSchema: 'ignore' },
      context: ({ req }) => this.mindHandleContext({ req }),
    };
  }

  private mindHandleContext({ req }) {
    const _log = logPrefix('mindHandleContext');

    const ctx = { mindUserId: null, mindUserRoles: null, mindSessionExpiresIn: null };
    try {
      if (req?.headers?.['mind-user-id']) {
        ctx.mindUserId = req?.headers?.['mind-user-id'];
        ctx.mindUserRoles = req?.headers?.['mind-user-roles'].split(',');
        ctx.mindSessionExpiresIn = new Date(req?.headers?.['mind-session-expires-in']);
      }
    } catch (e) {
      this.logger.error('Error setting context', _log, e);
      return;
    }
    return ctx;
  }
}
