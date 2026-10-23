import { ApolloFederationDriverConfig } from '@nestjs/apollo';
import { ApolloServerPluginLandingPageLocalDefault } from '@apollo/server/plugin/landingPage/default';
import GraphQLJSON from 'graphql-type-json';

type MindGqlOptionsInput = {
  // Only the JWKS service serves under a prefix; the gateway one keeps the driver default
  path?: string;
  context: ApolloFederationDriverConfig['context'];
};

export function buildMindGqlOptions({ path, context }: MindGqlOptionsInput): ApolloFederationDriverConfig {
  return {
    ...(path && { path }),
    autoSchemaFile: { path: 'schema.gql', federation: 2 },
    sortSchema: true,
    playground: false,
    plugins: [ApolloServerPluginLandingPageLocalDefault()],
    resolvers: { JSON: GraphQLJSON },
    // The JSON scalar is registered for every service; warn instead of failing the boot when no field uses it
    resolverValidationOptions: { requireResolversToMatchSchema: 'warn' },
    context,
  };
}
