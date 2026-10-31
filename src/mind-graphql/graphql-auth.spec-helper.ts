// Shared by the GraphQL auth service specs. Each spec still needs its own
//
//   jest.mock('graphql-type-json', () => ({ __esModule: true, default: { name: 'JSON' } }));
//
// because Jest hoists `jest.mock` per file. The scalar is stubbed because `graphql` is deliberately not a
// devDependency: consumers install this package with its devDependencies nested, and a second `graphql` copy there
// breaks their schema (`Int` from another realm).

export type LoggerMock = { debug: jest.Mock; error: jest.Mock };

export const createLoggerMock = (): LoggerMock => ({ debug: jest.fn(), error: jest.fn() });

export const EMPTY_IDENTITY = { mindUserId: null, mindUserRoles: null, mindSessionExpiresIn: null };

export const resolveContext = async (
  service: { createGqlOptions: () => Promise<{ context?: unknown }> },
  headers: Record<string, string>,
) => {
  const options = await service.createGqlOptions();
  return (options.context as (arg: unknown) => unknown)({ req: { headers } });
};
