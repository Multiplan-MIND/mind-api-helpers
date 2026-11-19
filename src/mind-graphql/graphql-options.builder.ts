import { ApolloFederationDriverConfig } from '@nestjs/apollo';
import { ApolloServerPluginLandingPageLocalDefault } from '@apollo/server/plugin/landingPage/default';
import GraphQLJSON from 'graphql-type-json';

import { getMindFederationConfig } from './graphql-federation.config';

type MindGqlOptionsInput = {
  /** Only the JWKS service serves under a prefix; the gateway one keeps the driver default */
  path?: string;
  context: ApolloFederationDriverConfig['context'];
};

export function buildMindGqlOptions({ path, context }: MindGqlOptionsInput): ApolloFederationDriverConfig {
  return {
    ...(path && { path }),
    /** Federation link pinned to the version and directives mind-api-router (@apollo/gateway) composes */
    autoSchemaFile: { path: 'schema.gql', federation: getMindFederationConfig() },
    sortSchema: true,
    playground: false,
    plugins: [ApolloServerPluginLandingPageLocalDefault()],
    resolvers: { JSON: GraphQLJSON },
    /** The JSON scalar is registered for every service; warn instead of failing the boot when no field uses it */
    resolverValidationOptions: { requireResolversToMatchSchema: 'warn' },
    context,
  };
}
