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

Node is pinned by `.nvmrc` (v24.22.1), `engines.node` is `^24.22.0` and the package manager is **yarn** (v1 /
classic).

```bash
nvm use                                   # required: Jest loads the ESM-only NestJS 12 through require(esm)
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
- `dependencies` holds `axios`, `jsonwebtoken`, `jwk-to-pem` and the OpenTelemetry packages (exact pins, except the
  `@opentelemetry/api` range). `axios` is imported by `error.helper.ts` and `graphql-auth-jwks.service.ts`.
- **Two release lines live in parallel.** 1.x serves services on Node older than 24 (NestJS 10, Mongoose 7/8, no
  observability); 2.x serves Node 24 from 24.22 on (`engines.node` `^24.22.0`, NestJS 12, Mongoose 9,
  `mind-observability`). A fix that applies to both ships in a version of each line, and a new Node major needs a
  new major of this library. NestJS 12 ships ESM only and CommonJS consumers load it through Node's `require(esm)`.
- Releasing means bumping `version` in `package.json`, tagging the commit, and updating the `#tag` in
  each consuming repo. Branches are used as refs too (`#feature/to-error-helper`) while a change is
  being validated against a service.

## Architecture

Dependency direction is one-way: `mind-helpers` ← `mind-logger` ← `mind-graphql` / `mind-mongoose`.
`mind-helpers` imports nothing internal, so it is the safe place for shared primitives. `mind-logger` also
imports `mind-observability/tracing/active-span`, a leaf that depends only on `@opentelemetry/api`.

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
(console only); any other value, or unset → `colorize` and `logs/<module>.log`. `logPrefix(method, infos)` builds the
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

### `mind-observability` — OpenTelemetry entry point

The module is split by concern. The root holds what serves both signals: `register.ts` (the entry, also reachable as `mind-api-helpers/observability` through the root `observability.js` shim, named after the module because the library has other modules), `start-observability.ts` (the switch), `observability-sdk.ts` (builds and starts `NodeSDK`), `esm-loader-hook.ts` (the `import` hook), `instrumentations.ts` (which instrumentations are on), `observability-resource.ts`, `observability-shutdown.ts`, `export-error-logger.ts`, `api-copies.ts`, `ai-sdk-calls.ts` (the AI SDK call lifecycle) and `ai-sdk-telemetry.ts` (AI SDK event shapes, provider/operation mapping, the GenAI schema URL and the global registration). `tracing/` holds what produces or reads spans: `tracing-instrumentations.ts` (options per instrumentation), `personal-data.ts`, `ignore-paths.ts`, `ai-sdk-tracing.ts` and `active-span.ts`. `metrics/` holds what produces metrics only: `metrics-instrumentations.ts` (host-metrics options) and `ai-sdk-metrics.ts`. Keep new files on that split. `src/mind-observability/README.md` (pt-BR, linked from the main README) documents the behaviour, the activation command, the variables and the defaults; this section only covers what matters when changing the code.

- **Switch and lazy load.** `isObservabilityEnabled` is true when `OTEL_EXPORTER_OTLP_ENDPOINT` is set and `OTEL_SDK_DISABLED` is not `true` (any case). Only after that check does `startObservability` load `observability-sdk.ts`, through `module.require` with `import type` for its types: a static import would load the SDK in every service, and `import()` resolves after the application has loaded the modules to patch. `dist/mind-observability/register.js` loaded without the variables must not put `sdk-node` in `require.cache`; `register.e2e.spec.ts` asserts it. Every other file reached from `src/index.ts` (`active-span.ts`, `observability-shutdown.ts`) must stay free of SDK imports.
- **`register` is not exported from `src/index.ts` on purpose.** The barrel imports `mongoose` at load time, and the instrumentations can only patch a module that has not been loaded yet. The root `observability.js` only requires `./dist/mind-observability/register`, so services start with `node -r mind-api-helpers/observability` without an `exports` map (an `exports` map would break the extensionless deep imports services use, such as `mind-api-helpers/dist/mind-logger/mind-logger.factory`). Use `-r`: ESM resolution does not add the extension, so `--import mind-api-helpers/observability` fails.
- **One entry for CommonJS and ESM.** `esm-loader-hook.ts` registers `import-in-the-middle/register-hooks.mjs` (synchronous `module.registerHooks`, replacing the deprecated `module.register`), required from where `@opentelemetry/instrumentation` resolves it so the hook and the instrumentations' `Hook()` share one copy. Being synchronous, it works when loaded with `-r`, so there is no separate ESM entry. Before Node 24.11.1 (`supportsSyncHooks()` false) it writes one stderr line and skips the hook: only `require`d modules are patched. Specs mock it; the real hook would alter Jest's own module loading.
- **No fixed exporter and no writes to `process.env`.** Exporters, protocol, sampler and propagators come from the standard variables, read by `NodeSDK`. The only override is `logRecordProcessors: []` when `OTEL_LOGS_EXPORTER` is unset, because `NodeSDK` would default logs to OTLP.
- **Instrumentations** come from `getNodeAutoInstrumentations`. `enabled: false` in its config beats `OTEL_NODE_ENABLED_INSTRUMENTATIONS`, so `instrumentations.ts` applies its defaults (dns, net, mongoose and winston off, host-metrics on) only while that variable is unset, and leaves host-metrics alone when `OTEL_NODE_DISABLED_INSTRUMENTATIONS` names it. The three config maps it spreads must keep distinct keys.
- **Personal data** is masked in-process by `personal-data.ts` (http/undici `requestHook`, ioredis and node-redis `dbStatementSerializer`). The patterns mirror `otelcol.processor.transform.redact` in `mind-api-observability`; change both together.
- **Resource:** the `env` detector goes last so `OTEL_SERVICE_NAME` and `OTEL_RESOURCE_ATTRIBUTES` win over what is detected; the process detector drops command-line attributes, which could carry a token.
- **AI SDK.** The AI SDK 7 telemetry integration interface is implemented twice, without depending on `ai`: `tracing/ai-sdk-tracing.ts` and `metrics/ai-sdk-metrics.ts` (durations from `performance.now()`). Both keep their per-call state in an `AiSdkCalls`, which expires calls that never finish. Tracer and meter declare `GEN_AI_SCHEMA_URL`; bump it together with any GenAI attribute rename. **Neither records prompts, replies, tool arguments or tool results**, and the tracing spec asserts it. When bumping across `ai` majors, check the `Telemetry` interface in `ai`'s `index.d.ts`; the AI SDK swallows integration exceptions, so a shape mismatch loses telemetry, not requests.
- **Log correlation.** `MindLoggerService` reads `currentSpanIds()` at the call site and `mtsLoggerFormat` appends ` | trace_id=<id> span_id=<id>` only when present, so existing field positions never move. `warn`/`error` call `markActiveSpanWithLog`, which sets `mind.log.warn`/`mind.log.error` so a tail-sampling collector can keep those traces. `mind-logger` depends on `tracing/active-span.ts`, which depends only on `@opentelemetry/api`.
- **Shutdown.** The signal listener stays registered while the flush runs, so a signal re-raised by NestJS's shutdown hooks waits for it; only then does it remove itself and re-raise when nobody else listens.
- **Versions:** `@opentelemetry/api` is a range (`^1.10.0`) on purpose; everything else is pinned on the SDK 0.300 line (`sdk-node` 0.300.0, `auto-instrumentations-node` 0.82.0, `instrumentation` 0.300.0, `instrumentation-express` 0.72.0, `resources` 3.0.0, `resource-detector-container` 0.9.0). Bump them together and keep `auto-instrumentations-node` on the same `sdk-node` line.
- **Tests:** the unit specs mock `NodeSDK` and `getNodeAutoInstrumentations`; the tracing specs use the real `TracerProvider` with an `InMemorySpanExporter` (`@opentelemetry/sdk-trace` 3.0.0) and the `AsyncLocalStorageContextManager`. `register.e2e.spec.ts` compiles `src/` into `node_modules/.cache/mind-observability-e2e`, starts the services in `__fixtures__/service` (`server.cjs` and `server.mjs`) with `-r register` against an in-memory OTLP/JSON receiver, and checks spans, masking, metrics and the resource, that `ioredis` loaded with `import` is patched (`esm-patched=true`; `node:http` would be patched even without the hook), plus that nothing loads when `OTEL_SDK_DISABLED=true`.

## Conventions and gotchas

- **Code is English** (identifiers, file names, commit messages, branch names, log/error strings), per the "Idioma"
  section of the README; the READMEs (the main one and `src/mind-observability/README.md`) are the only documents
  written in pt-BR.
- **Comments and test descriptions use one language per module.** `mind-logger`, `mind-helpers`, `mind-graphql` and
  `mind-mongoose` use English. `mind-observability` uses Brazilian Portuguese, with accents: every explanatory comment
  in `.ts`, `.js`, `.cjs` and `.mjs` is a `/** */` block, never `//`; it states only the non-obvious why, briefly; no
  full JSDoc with `@param`/`@returns`. Its spec files open with a `Testes executados:` block listing every `it`
  (nested like the `describe`s), then the imports, then `/** Configuração */`, `/** Fixtures */`,
  `/** Factories/helpers */` and `/** Testes */` sections as needed, with `describe`/`it` descriptions in Portuguese;
  the list is updated whenever an `it` changes. When touching a file, write in its module's language and translate
  what is in the other one.
- **Documentation and comments describe the current state, timelessly.** No reference to the plan, review or request
  behind a change, and no transition narrative ("no longer", "used to", "now does"): readers of the repository have
  none of that context. A rejected alternative is stated as a design property ("X would break Y because"). The
  history of a change belongs in the pull request description.
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
