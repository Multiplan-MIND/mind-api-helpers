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

Node is pinned by `.nvmrc` (v20.20.2) and the package manager is **yarn** (v1 / classic).

```bash
nvm use                                   # required: the lockfile and the launch.json path assume v20
yarn install
yarn build                                # tsc -> dist/ (prebuild wipes dist via rimraf)
yarn lint                                 # eslint (prettier runs as an eslint rule)
yarn lint-autofix
yarn test                                 # jest, config in jest.config.json, testRegex .spec.ts$
yarn test src/mind-helpers               # one directory
yarn test -t 'should preserve subclasses' # one test by name
```

There is no watch/coverage script; use `yarn test --watch` / `--coverage` directly. `.vscode/launch.json`
provides an "API Helpers - Jest" debug configuration (hardcoded to `$NVM_DIR/versions/node/v20.20.2`).

## How this library is distributed

Published to **GitHub Packages** as `@multiplan-mind/mind-api-helpers`, built by CI. Consumers
install a version, not a git ref, and never compile the library themselves — the published tarball
(16 kB) contains only `dist/`.

`dist/` stays gitignored; it exists only inside the tarball. Publishing is driven by
`.github/workflows/publish.yml`, triggered by a push to `master`:

1. Reads `version` from `package.json`.
2. **If that version is already published, it exits without doing anything.** This is what makes the
   workflow idempotent — a merge into `master` with no bump is a no-op, and a re-run never fails.
3. Runs `lint`, `test`, `build` — the same gate as `ci.yml`.
4. `npm publish` using the Actions-provided `GITHUB_TOKEN` (no PAT to create, no secret to rotate).
5. Creates the `vX.Y.Z` tag and the GitHub Release.

`.deploy/create-release.sh` only bumps `version` and opens the two PRs (`master` and `develop`); it
neither tags nor publishes. `ci.yml` runs lint/test/build on every PR.

Consumers need an `.npmrc` with `@multiplan-mind:registry=https://npm.pkg.github.com`,
`//npm.pkg.github.com/:_authToken=${NPM_TOKEN}` and `always-auth=true` — the last one is not
optional, or yarn v1 omits the auth header on the download URLs it writes into `yarn.lock` and the
second install 401s. See the README for the per-service migration steps.

### Dependency layout

Every package is classified by actual use, cross-checking source `import`s, the `require()` calls
that survive in `dist/`, and the types leaking into the public `.d.ts`:

- `dependencies` — `axios`, `jsonwebtoken`, `jwk-to-pem`: leaf libraries with no shared singleton
  that never appear in the public types.
- `peerDependencies` — everything whose **instance identity** matters to the host Nest app, or that
  appears in the `.d.ts`: `@nestjs/common`, `@nestjs/graphql`, `@nestjs/apollo`, `@apollo/server`,
  `graphql-type-json`, `ioredis`, `mongoose`, `nest-winston`, `winston`, `reflect-metadata`.
- `devDependencies` — build/lint/test tooling, the `@types`, plus a pinned copy of every peer so the
  library compiles here.

Two entries look wrong but are deliberate:

- `@nestjs/core` and `rxjs` are devDeps and **not** peers. Nothing in `src/` uses them; they exist
  because the `@nestjs/common` barrel does `require('rxjs/operators')` and `TestingModule` inherits
  types from `@nestjs/core`. Whoever declares `@nestjs/common` satisfies those peers, not us.
- `reflect-metadata` is a peer with no `import` anywhere. `dist/` calls `Reflect.metadata(...)`
  behind a `typeof Reflect.metadata === 'function'` guard, so without the polyfill loaded by the
  consumer the metadata is dropped **silently** and Nest DI breaks with no clear error.

`ioredis` and `mongoose` are genuine runtime requires, not just types: `ioredis` because
`emitDecoratorMetadata` emits the constructor's `design:paramtypes`, and `mongoose` because
`query.helper.ts` calls `new Types.ObjectId(...)`.

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
- `build` runs `tsc -p tsconfig.build.json`, which excludes the spec files from `dist/` (and with
  them the stray `require("@nestjs/testing")` that used to ship in the package).
- The `lint` script's `src/**/*.ts` is expanded by bash with `globstar` off, i.e. it means `src/*/*.ts`.
  `src/index.ts`, `src/mind-graphql/entities/` and `src/mind-mongoose/` are silently **not linted**.
  Pass explicit paths to `eslint` when checking those.
- `strictNullChecks` and `noImplicitAny` are off, so absent null checks are not compiler errors here
  even though they would be in the consuming services.
- Running the tests writes real log files to `logs/` (the "with the real winston logger" suite is
  intentionally not mocked); `logs/` is gitignored.
- `test/` exists but is empty — specs live next to the code as `*.spec.ts`.
- Dependabot opens PRs against `develop`; `master` is the release branch that carries the tags.
