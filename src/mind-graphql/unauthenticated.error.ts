import { GraphQLError } from 'graphql';

// The context function must throw (not return undefined): the Apollo driver turns an empty context into
// `{ req }`, and the request would go on as anonymous with status 200.
export function unauthenticatedError(message: string): GraphQLError {
  return new GraphQLError(message, { extensions: { code: 'UNAUTHENTICATED', http: { status: 401 } } });
}
