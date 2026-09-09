# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## README.md vs CLAUDE.md

Which file a fact belongs in — apply this before adding anything to either:

> Does the fact change what you **type in a terminal / open in a browser**, or what
> you **write inside a file**?

| README.md — the contract and the intent      | CLAUDE.md — the map and the minefield                     |
| -------------------------------------------- | --------------------------------------------------------- |
| What the service is, setup, how to run it    | Where the code lives and why it is shaped that way        |
| URLs, ports, env vars, staging               | Invariants and conventions to follow when adding code     |
| API contract: GraphQL, REST, queues          | Implementation traps (silent bypasses, load-bearing bits) |
| Deploy and branch flow                       | Where reality diverges from the docs: broken scripts, stale claims, config drift |
| Operational troubleshooting (terminal recipe)| Implementation gotchas (only matter with a file open)     |

Three rules keep the two files from drifting into copies of each other:

1. **One owner per fact.** If it is useful in both, it lives with its owner and the
   other file links to it — it is never restated.
2. **The command cheat sheet below is the only sanctioned duplication.** It mirrors
   the README's narrated setup on purpose, because it is what gets run constantly.
3. **Language is part of the fence.** The README is pt-BR, this file is English. If
   you find yourself translating a paragraph across the two, you are duplicating it.


## What this repository is

A private, internal NestJS support library (`mind-api-helpers`) shared by the `mind-api-*` /
`multi-api-*` services. It ships no application, no `main.ts` and no HTTP server — only the logger,
the GraphQL bootstrap services, the error helpers and the Mongoose query builder that those services
import.

Everything public goes through the barrel `src/index.ts`. A new file is invisible to consumers until
it is re-exported there.

Requirements, install, scripts, the consumer contract (`.npmrc`, peers, usage examples) and
the release process live in [`README.md`](./README.md).

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

## What being a published package constrains

The README documents the release flow and the consumer-side `.npmrc`. What it means for code
written here:

- **The published tarball contains only `dist/`** (16 kB). Anything a consumer needs at runtime
  must survive compilation and be re-exported from `src/index.ts` — a file that is only imported
  internally is invisible to them.
- **`build` runs `tsc -p tsconfig.build.json`**, which excludes the spec files from `dist/` (and
  with them the stray `require("@nestjs/testing")` that used to ship in the package).
- **The version in `package.json` is the publish trigger.** `publish.yml` exits early if that
  version already exists, so a merge to `master` without a bump is a silent no-op — if a change
  did not reach consumers, check the bump before anything else.

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
no-op. `logPrefix(method, infos)` builds the `pid|method#info1;info2` string that every call site
passes as `prefix`; where `MindLoggerFactory` puts the file and what `DEBUG` does are in the
README.

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

## Conventions

- `strictNullChecks` and `noImplicitAny` are off — here **and** in all five consuming services
  (verified 2026-09-02). Absent null checks are never a compiler error anywhere in the platform,
  so nullability is a review concern, not a compiler-enforced one. An earlier version of this
  file claimed the consumers were stricter; they are not.

## Reality vs. the docs

- **No consumer has migrated to 2.x yet.** As of 2026-09-02 all five services
  (`mind-api-user`, `-webhook`, `-router`, `-parking`, `-payment`) still install this library
  from the git tag `#1.5.0`, and none of them has an `.npmrc`. So the README's migration guide
  describes work that has not started: the `1.x` tags must keep working, and 1.x compatibility
  is a live constraint on anything changed here — not a legacy concern.
- **`mind-api-router` cannot migrate as-is.** It does not declare `mongoose`, which the barrel
  genuinely `require`s since `query.helper.ts` began calling `new Types.ObjectId(...)`. Today it
  resolves only through the nested `node_modules` the git install leaves behind.
