# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this repository is

A private, internal NestJS support library (`mind-api-helpers`) shared by the `mind-api-*` /
`multi-api-*` services. It ships no application, no `main.ts` and no HTTP server — only the logger,
the GraphQL bootstrap services, the error helpers and the Mongoose query builder that those services
import.

Everything public goes through the barrel `src/index.ts`. A new file is invisible to consumers until
it is re-exported there.

## Commands

`.nvmrc` selects Node 24 (`24`, the newest 24.x installed in nvm), `engines.node` is `>=20.15.1` (no upper
bound) and the package manager is **yarn** (v1 / classic).

```bash
nvm use                                   # picks Node 24 from .nvmrc
yarn install                              # see the install cycle warning below
yarn build                                # tsc -> dist/ (prebuild wipes dist via rimraf)
yarn lint                                 # eslint (prettier runs as an eslint rule)
yarn lint-autofix
yarn test                                 # jest, config in jest.config.json, testRegex .spec.ts$
yarn test src/mind-helpers               # one directory
yarn test -t 'should preserve subclasses' # one test by name
```

There is no watch/coverage script; use `yarn test --watch` / `--coverage` directly. `.vscode/launch.json`
provides an "API Helpers - Jest" debug configuration, still hardcoded to `$NVM_DIR/versions/node/v20.20.2`
(not the `.nvmrc` version), so it needs that exact Node installed in nvm.

## How this library is distributed

Consumers depend on the **git URL pinned to a tag**, not on a registry:

```json
"mind-api-helpers": "https://github.com/Multiplan-MIND/mind-api-helpers.git#1.3.0"
```

`dist/` is gitignored, so the consumer has to build the package after cloning it. That is what the
install cycle in `package.json` is for, and it is the reason the dependency layout looks wrong:

- `preinstall: yarn --ignore-scripts` — installs the dependency tree, `devDependencies` included, so
  `typescript` exists inside the consumer's `node_modules/mind-api-helpers`.
- `postinstall: yarn build` — compiles `src/` to `dist/`, which `main`/`types` point at.

Consequences to keep in mind when touching `package.json`:

- Almost everything `src/` imports at **runtime** (`mongoose`, `ioredis`, `jsonwebtoken`, `jwk-to-pem`,
  `graphql-type-json`, `winston`, `nest-winston`, `@nestjs/*`, `@apollo/server`) sits in
  `devDependencies`. The peers are `@nestjs/common` ^11, `@nestjs/graphql` ^13, `@nestjs/apollo` ^13,
  `@apollo/server` ^5, `nest-winston` ^1.9.3, `winston` ^3, `graphql-type-json`, `ioredis`, `mongoose` 7/8 and
  `reflect-metadata` 0.1/0.2, so this branch only fits consumers already on NestJS 11. At runtime `mongoose`,
  `@nestjs/common`, `@nestjs/graphql`, `@apollo/server`, `winston`, `nest-winston`, `ioredis`,
  `graphql-type-json` and `reflect-metadata` resolve from `node_modules/mind-api-helpers/node_modules` (the
  nested copy installed by the `preinstall`); only `graphql` resolves from the consumer's root. That is why a
  version bump here can silently disagree with what the services install.
- `dependencies` holds only `axios`, `jsonwebtoken` and `jwk-to-pem` (exact pins). `axios` is imported by
  `error.helper.ts` and `graphql-auth-jwks.service.ts`.
- Releasing means bumping `version` in `package.json`, tagging the commit, and updating the `#tag` in
  each consuming repo. Branches are used as refs too (`#feature/to-error-helper`) while a change is
  being validated against a service.

## Architecture

Dependency direction is one-way: `mind-helpers` ← `mind-logger` ← `mind-graphql` / `mind-mongoose`.
`mind-helpers` imports nothing internal, so it is the safe place for shared primitives.

### `mind-logger` — the decorator/registry pattern

The unusual part: **module names are collected at decoration time and turned into providers later.**

1. `@MindLogger('SomeService')` (`mind-logger.decorator.ts`) pushes the name into the module-level
   array `modulesForLoggers` and returns `Inject('MindLoggerService<name>')`.
2. `MindLoggerModule.forRoot()` calls `createMindLoggerProviders()`, which maps that array into one
   provider per name, each a factory that calls `logger.setModule(name)`.

So `forRoot()` only sees a name if the class carrying the decorator has already been imported when
`forRoot()` runs. A missing `MindLoggerService<name>` provider at bootstrap is almost always this
ordering problem, not a typo. Tests reproduce the setup by calling `createMindLoggerProviders()`
inside `beforeEach` (see `mind-logger.service.spec.ts`).

`MindLoggerService` is `Scope.TRANSIENT` and lazy: `loggerService` is undefined until `setModule()`
builds the winston logger, and every method uses `?.`, so logging before `setModule()` is a silent
no-op. `MindLoggerFactory` writes to `logs/<module>.log` **relative to `process.cwd()`** and switches
the level to `debug` when `process.env.DEBUG` is set. `logPrefix(method, infos)` builds the
`pid|method#info1;info2` string that every call site passes as `prefix`.

### `mind-helpers/error.helper.ts`

`tsconfig.json` sets `useUnknownInCatchVariables: true`, so `catch (e)` is `unknown`. The convention
in this repo is `const err = toError(e)` before touching `.message`/`.stack` or handing the value to
the logger.

- `toError(value): ThrownError` — returns the same instance when it already is an `Error` (subclasses
  and driver-attached fields survive); otherwise builds an `Error` from `message`, copying `code`.
  `ThrownError` widens `code` to `string | number` so Mongo's `11000` and Node/axios' `ECONNREFUSED`
  are readable without a cast.
- `MindError(code, message, { cause, context })` — the app-level error; its own fields serialize,
  unlike a plain `Error`, whose `name`/`message` are non-enumerable and stringify to `{}`.
- `jsonError(err)` — shapes a value for logging and **strips auth headers** (`Authorization`,
  `X-API-KEY`, `Apikey`, `x-api-key`, `WPS-API-KEY`) from axios errors. It deletes them from the
  object it was given, not from a copy — a deliberate, test-asserted side effect. Anything not an
  axios error is passed through unchanged.
- Known limitation, asserted in `mind-logger.service.spec.ts`: `MindLoggerService.error()` calls
  `JSON.stringify(jsonError(err))` without circular-reference handling, so logging a circular object
  throws. `toError()` itself is safe. If that is ever fixed, flip the test that expects the throw.

### `mind-graphql` + `mind-mongoose`

`GraphqlAuthJwksService` and `GraphqlAuthGatewayService` are two interchangeable `GqlOptionsFactory`
implementations for Apollo Federation 2. Both require the consumer to provide a `REDIS_CLIENT`
provider (an `ioredis` client) and both build the same request context
(`mindUserId`, `mindUserRoles`, `mindSessionExpiresIn`) — the JWKS one by verifying the `Bearer`
token against a JWKS document fetched from `process.env.JWKS_URL` and cached in redis under
`JWKS_PUBLIC_KEY` for a day; the gateway one by trusting the `mind-user-id` / `mind-user-roles` /
`mind-session-expires-in` headers already injected upstream. Use the gateway variant behind the
router, the JWKS variant at the edge. On failure both return `undefined` instead of throwing, which
leaves the resolvers with no context.

On this branch both target NestJS 11, `@nestjs/graphql`/`@nestjs/apollo` 13 and Apollo Server 5. `@nestjs/apollo`
13 loads `@as-integrations/express5` at runtime, so the consumer must have it installed. The JWKS service
serves `/*splat/graphql` (Express 5 / path-to-regexp 8 syntax for the old `/*/graphql`). Both set
`status400ForVariableCoercionErrors: false` (keep Apollo Server 4's 200 for variable coercion errors) and
`resolverValidationOptions: { requireResolversToMatchSchema: 'ignore' }` (keep ignoring the `JSON` resolver when
no field uses the scalar, as @nestjs/graphql 12 did).

Known limitation of this branch: the federation `@link` is **not pinned**. Both services pass
`autoSchemaFile: { federation: 2 }`, so the subgraph declares the @nestjs/graphql 13 default, `federation/v2.12`,
which `mind-api-router`'s `@apollo/gateway` 2.4.x cannot compose ("Invalid version v2.12 for the federation
feature"). A service behind the current router must not take this branch's code expecting composition to work.

`mind-mongoose/helpers/query.helper.ts` translates the GraphQL input types from
`mind-graphql/entities/query.entities.ts` into a Mongoose filter/options pair, so the two evolve
together: a new `OperationEnum` member needs a matching `case` in `getQuery`, and a new
`*Value`/`*Values` field needs an entry in the `isNullOrUndefined` chain (order matters — the first
non-null wins). `getOptions` defaults to `skip: 0, limit: 100` when no options are given, but honours
the GraphQL defaults (`limit: 10`, sort by `updatedAt` desc) when they are.

## Conventions and gotchas

- **Code is English only**, per the "Idioma" section of the README: identifiers, file names, comments,
  commit messages, branch names, log/error strings and test descriptions. `src/` is already fully in
  English; the README is the one document written in pt-BR.
- Prettier config is duplicated in `.prettierrc` and inline in `.eslintrc.js` — edit both.
  Single quotes, 120 columns, trailing commas, 2 spaces.
- `build` runs `tsc -p tsconfig.build.json`, which extends `tsconfig.json` and excludes `**/*spec.ts`, so spec
  files are not compiled into `dist/`.
- The `lint` script's `src/**/*.ts` is expanded by bash with `globstar` off, i.e. it means `src/*/*.ts`.
  `src/index.ts`, `src/mind-graphql/entities/` and `src/mind-mongoose/` are silently **not linted**.
  Pass explicit paths to `eslint` when checking those.
- `strictNullChecks` and `noImplicitAny` are off, so absent null checks are not compiler errors here
  even though they would be in the consuming services.
- Running the tests writes real log files to `logs/` (the "with the real winston logger" suite is
  intentionally not mocked); `logs/` is gitignored.
- Never add `graphql` to `devDependencies`. The consumer's `preinstall` installs this package's devDependencies
  nested under `node_modules/mind-api-helpers/node_modules`, and a second `graphql` copy there makes the
  `@Field(() => Int)` input types in `query.entities.ts` unresolvable in the consumer ("Cannot determine a GraphQL
  input type"). Specs stub `graphql-type-json` instead.
- `test/` exists but is empty — specs live next to the code as `*.spec.ts`.
- Dependabot opens PRs against `develop`; `master` is the release branch that carries the tags.
