import { ApolloFederationDriverConfig } from '@nestjs/apollo';
import { ApolloServerPluginLandingPageLocalDefault } from '@apollo/server/plugin/landingPage/default';
import GraphQLJSON from 'graphql-type-json';

import { MIND_FEDERATION_CONFIG } from './graphql-federation.config';

type MindGqlOptionsInput = {
  // Only the JWKS service serves under a prefix; the gateway one keeps the driver default
  path?: string;
  context: ApolloFederationDriverConfig['context'];
};

export function buildMindGqlOptions({ path, context }: MindGqlOptionsInput): ApolloFederationDriverConfig {
  return {
    ...(path && { path }),
    // Federation link pinned to v2.3 so mind-api-router (@apollo/gateway 2.4.x) can compose the subgraph
    autoSchemaFile: { path: 'schema.gql', federation: MIND_FEDERATION_CONFIG },
    sortSchema: true,
    playground: false,
    plugins: [ApolloServerPluginLandingPageLocalDefault()],
    resolvers: { JSON: GraphQLJSON },
    // The JSON scalar is registered for every service; warn instead of failing the boot when no field uses it
    resolverValidationOptions: { requireResolversToMatchSchema: 'warn' },
    context,
  };
}
