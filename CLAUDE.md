# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this repository is

A private, internal NestJS support library (`mind-api-helpers`) shared by the `mind-api-*` /
`multi-api-*` services. It ships no application, no `main.ts` and no HTTP server — only the logger,
the GraphQL bootstrap services, the error helpers, the Mongoose query builder and the OpenTelemetry
entry point that those services import.

Everything public goes through the barrel `src/index.ts`. A new file is invisible to consumers until
it is re-exported there.

## Commands

Node is pinned by `.nvmrc` (v24.22.1), `engines.node` is `>=24` (no upper bound) and the package manager is
**yarn** (v1 / classic). Tests need Node >= 24.9: the NestJS 12 packages are ESM-only and Jest 30 can only
`require()` them from that version on.

```bash
nvm use                                   # required: Jest needs Node >= 24.9 (require(esm))
yarn install                              # see the install cycle warning below
yarn build                                # tsc -> dist/ (prebuild wipes dist via rimraf)
yarn lint                                 # eslint (prettier runs as an eslint rule)
yarn lint-autofix
yarn test                                 # node --experimental-vm-modules jest; config in jest.config.json
yarn test src/mind-helpers               # one directory
yarn test -t 'should preserve subclasses' # one test by name
```

There is no watch/coverage script; use `yarn test --watch` / `--coverage` directly. The `test` script runs Jest
under `node --experimental-vm-modules`; without the flag every suite that imports `@nestjs/*` fails with
`Must use import to load ES Module` (NestJS 12 ships ESM only). `.vscode/launch.json` provides an
"API Helpers - Jest" debug configuration (nvm `runtimeVersion` 24, same flag in `runtimeArgs`).

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

- Almost everything `src/` imports at **runtime** (`mongoose`, `ioredis`,
  `graphql-type-json`, `winston`, `nest-winston`, `@nestjs/*`, `@apollo/server`) sits in
  `devDependencies`. The peers are `@nestjs/common` ^12, `@nestjs/graphql` ^14, `@nestjs/apollo` ^14,
  `@apollo/server` ^5, `graphql` ^16.11, `nest-winston` ^2, `winston` ^3, `graphql-type-json`, `ioredis`,
  `mongoose` ^9, `reflect-metadata` 0.1/0.2 and `@as-integrations/express5` ^1.1.2, so it only fits consumers
  already on NestJS 12. At runtime `mongoose`,
  `@nestjs/common`, `@nestjs/graphql`, `@apollo/server`, `winston`, `nest-winston`, `ioredis`,
  `graphql-type-json` and `reflect-metadata` resolve from `node_modules/mind-api-helpers/node_modules` (the
  nested copy installed by the `preinstall`); only `graphql` resolves from the consumer's root. That is why a
  version bump here can silently disagree with what the services install, and why the tsconfig `paths` entry
  below exists.
- The peer `mongoose` is a single major (^9) on purpose: `getQuery` builds `ObjectId`s with the nested `mongoose`, and a
  service on another bson major fails with `BSONVersionError`. A new Mongoose major needs a new major of this library.
- `dependencies` holds only `axios`, `jsonwebtoken` and `jwk-to-pem` (exact pins). `axios` is imported by
  `error.helper.ts` and `graphql-auth-jwks.service.ts`.
- `engines.node` is `>=24`: the library and its consuming services move to Node 24 together. NestJS 12 ships ESM
  only and CommonJS consumers load it through Node's `require(esm)`. Running this package's tests needs Node >= 24.9
  (Jest 30).
- Releasing means bumping `version` in `package.json`, tagging the commit, and updating the `#tag` in
  each consuming repo. Branches are used as refs too (`#feature/to-error-helper`) while a change is
  being validated against a service.

## Architecture

Dependency direction is one-way: `mind-helpers` ← `mind-logger` ← `mind-graphql` / `mind-mongoose`.
`mind-helpers` imports nothing internal, so it is the safe place for shared primitives. `mind-logger` also
imports `mind-tracing/trace-id`, a leaf that depends only on `@opentelemetry/api`.

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
the level to `debug` when `process.env.DEBUG` is set. Colour and the `File` transport are controlled
**only** by `process.env.NODE_ENV`: exactly `'production'` → no `colorize` and no `File` transport
(console only); any other value, or unset → `colorize` and `logs/<module>.log`. `isTTY` and
`KUBERNETES_SERVICE_HOST` are no longer consulted. `logPrefix(method, infos)` builds the
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

Both share their options through `buildMindGqlOptions` (`graphql-options.builder.ts`); a service only adds its
`context` (and the JWKS one its `path`), so a compatibility option is changed there, once. Required versions, the
Express 5 path, the `'warn'` resolver validation, the `Date` type of `mindSessionExpiresIn`, the federation `@link`
pinned by `getMindFederationConfig()` (`graphql-federation.config.ts`) and the consumer `paths` workaround for
TypeScript 5.9 are documented in the README ("GraphQL" section), not repeated here.

`mind-mongoose/helpers/query.helper.ts` translates the GraphQL input types from
`mind-graphql/entities/query.entities.ts` into a Mongoose filter/options pair, so the two evolve
together: a new `OperationEnum` member needs a matching `case` in `getQuery`, and a new
`*Value`/`*Values` field needs an entry in the `isNullOrUndefined` chain (order matters — the first
non-null wins). `getOptions` defaults to `skip: 0, limit: 100` when no options are given, but honours
the GraphQL defaults (`limit: 10`, sort by `updatedAt` desc) when they are.

### `mind-tracing` — OpenTelemetry entry point

`startTracing(env = process.env)` (`start-tracing.ts`) starts the OpenTelemetry `NodeSDK` with the OTLP/HTTP trace exporter, the OTLP metrics exporter and nine instrumentations (http, express, nestjs-core, mongodb, ioredis, amqplib, undici, graphql, runtime-node), then registers the AI SDK integration. `register.ts` calls `loadTracingEnvFile()` and `startTracing()`; consumers load it with `node -r mind-api-helpers/dist/mind-tracing/register dist/main.js` (preferred, no code change) or as the first import of `main.ts`. `NODE_OPTIONS` is discouraged because every Node process in the container (yarn, Nest CLI, migrations) would start an SDK under the service name.

- **`register` is not exported from `src/index.ts` on purpose.** The barrel imports `mongoose` at load time, and the instrumentations can only patch a module that has not been loaded yet. Re-exporting it would defeat the load order.
- The SDK, the exporters and the instrumentations are loaded with `require` **inside** `startTracing`, after the disabled / no-endpoint checks, so nothing from `@opentelemetry/sdk-node` is loaded when tracing is off. Use `import type` for their types. `dist/mind-tracing/register.js` loaded without env must not put `sdk-node` in `require.cache`. `ai-sdk-telemetry.ts` and `trace-id.ts` import only `@opentelemetry/api`, which is safe to load eagerly.
- `OTEL_METRICS_EXPORTER` defaults to `otlp` and `OTEL_LOGS_EXPORTER` to `none` on the given `env`. Metrics therefore go to the same endpoint as traces, which must be a collector that accepts `/v1/metrics`. The `env` parameter is meant for tests: the defaults only reach `NodeSDK` when `env` is `process.env`.
- `loadTracingEnvFile()` (`tracing-env-file.ts`) copies only `OTEL_*` and `TRACING_*` from `.env` in the working directory into `process.env`, never overriding values already set, because `register` runs before `ConfigModule`/`dotenv`. It uses `util.parseEnv` (Node >= 20.12) and does nothing without it.
- `ignore-paths.ts` ignores any incoming path ending in `/health` or `/health/live` (services mount health under a per-environment prefix), plus the exact paths in `TRACING_IGNORE_PATHS`.
- `ai-sdk-telemetry.ts` implements the AI SDK 7 telemetry integration interface without depending on `ai`: it pushes an object into `globalThis.AI_SDK_TELEMETRY_INTEGRATIONS`, which `ai` reads on every call that has no `telemetry.integrations` of its own. It emits `invoke_agent <model>` / `chat <model>` / `execute_tool <name>` spans and the `gen_ai.client.token.usage` / `gen_ai.client.operation.duration` histograms, following the GenAI semantic conventions. `executeLanguageModelCall` and `executeTool` run the provider request and the tool inside their spans, so HTTP/DB spans nest under them. **It never records prompts, replies, tool arguments or tool results**, and the spec asserts it. The event types are local, minimal shapes: when bumping across `ai` majors, check the `Telemetry` interface in `ai`'s `index.d.ts`. The AI SDK swallows exceptions thrown by integrations (`notify`), so a shape mismatch loses spans, not requests.
- `MindLoggerService` reads `currentTraceId()` at the call site (winston may format later, outside the span) and passes it as `context.traceId`; `mtsLoggerFormat` appends ` | trace_id=<id>` only when present, so existing field positions never move. `mind-logger` therefore depends on `mind-tracing/trace-id`, which depends only on `@opentelemetry/api`.
- Export errors go to OpenTelemetry's diag error handler, and `NodeSDK` installs a diag logger only when `OTEL_LOG_LEVEL` is set. When it is not, `startTracing` installs an ERROR-level logger that writes the first error to stderr and ignores the rest.
- Consumers should keep `"resolutions": { "@opentelemetry/api": "1.9.0" }` (check with `yarn why @opentelemetry/api`): two copies (1.9.0 and a newer 1.x) can leave the SDK and the instrumentations not seeing each other.
- A `SIGTERM` listener disables Node's default exit-on-SIGTERM, so the handler flushes (5 s cap, unref'd timer) and re-raises `SIGTERM` only when `process.listenerCount('SIGTERM') === 0`.
- **Pinned versions (no `^`):** `@opentelemetry/api` 1.9.0, `sdk-node` 0.223.0, `exporter-trace-otlp-http` 0.223.0, `instrumentation-http` 0.223.0, `instrumentation-express` 0.71.1, `instrumentation-nestjs-core` 0.70.0, `instrumentation-mongodb` 0.76.0, `instrumentation-ioredis` 0.71.0, `instrumentation-amqplib` 0.70.0, `instrumentation-undici` 0.33.0, `instrumentation-graphql` 0.71.0, `instrumentation-runtime-node` 0.36.1. All of them depend on `@opentelemetry/instrumentation` 0.223.x, so there is a single copy of it. Newer releases require Node >= 22.15, and consumers still run Node 20, so **these versions stay on the 0.223 line**; do not bump them without moving the Node floor of the consuming services. The package itself declares no `engines`.
- Tests use the real `BasicTracerProvider` with an `InMemorySpanExporter` and the `AsyncLocalStorageContextManager` (`sdk-trace-base` and `context-async-hooks` 2.12.0 in `devDependencies`) where span parentage matters.

## Conventions and gotchas

- **Code is English only**, per the "Idioma" section of the README: identifiers, file names, comments,
  commit messages, branch names, log/error strings and test descriptions. `src/` is already fully in
  English; the README is the one document written in pt-BR.
- Prettier config is duplicated in `.prettierrc` and inline in `.eslintrc.js` — edit both.
  Single quotes, 120 columns, trailing commas, 2 spaces.
- `build` runs `tsc -p tsconfig.build.json`, which extends `tsconfig.json` and excludes `**/*spec.ts` and
  `**/*spec-helper.ts`, so spec files and spec helpers are not compiled into `dist/`. `.eslintrc.js` ignores the
  same files through `ignorePatterns`.
- The `lint` scripts quote the glob (`"src/**/*.ts"`) so eslint, not the shell, expands it and lints all of `src/`.
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
