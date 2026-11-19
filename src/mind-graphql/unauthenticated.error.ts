// `graphql` is resolved at call time, from the consuming service: it is a peer dependency and deliberately not a
// devDependency here (a nested copy would make this error fail Apollo's `instanceof GraphQLError` check).
// The context function must throw (not return undefined): the Apollo driver turns an empty context into
// `{ req }`, and the request would go on as anonymous with status 200.
export function unauthenticatedError(message: string): Error {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { GraphQLError } = require('graphql');
  return new GraphQLError(message, { extensions: { code: 'UNAUTHENTICATED', http: { status: 401 } } });
}
