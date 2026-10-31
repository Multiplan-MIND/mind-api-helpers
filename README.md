<p align="center">
  <a href="http://www.multiplan.com.br/" target="blank"><img width="300" src="https://github.com/user-attachments/assets/7b892075-a937-4651-8d73-b6545d8fcf08" alt="Multi Logo" /></a>
</p>

## Descrição

Biblioteca interna de apoio dos serviços MIND, escrita em NestJS. Não é uma aplicação: não tem
`main.ts` nem servidor HTTP — só o que é compartilhado entre os `mind-api-*` / `multi-api-*`:

| Módulo          | O que oferece                                                                                                              |
| --------------- | -------------------------------------------------------------------------------------------------------------------------- |
| `mind-logger`   | logger baseado em winston, com escopo por módulo (`MindLoggerModule`, `MindLoggerService`, `@MindLogger()`, `logPrefix()`) |
| `mind-helpers`  | `MindError`, `toError()`, `jsonError()` e `isNullOrUndefined()`                                                            |
| `mind-graphql`  | `GraphqlAuthJwksService` e `GraphqlAuthGatewayService` (Apollo Federation 2) e os _input types_ de consulta                |
| `mind-session`  | revogação de sessões (`isSessionRevoked`, `markSessionRevoked`, `markSessionsRevoked`) e `extractRequestInfo()`            |
| `mind-mongoose` | `getQuery()` / `getOptions()`, que traduzem os _inputs_ GraphQL em filtro e opções do Mongoose                             |

Tudo o que é público passa pelo _barrel_ `src/index.ts`: um arquivo novo só fica visível para os
serviços quando é reexportado lá.

## Idioma

Este README é o único documento em português. **O código é em inglês** — identificadores, nomes de
arquivos e diretórios, comentários e JSDoc, mensagens de log e de erro, descrições de teste, mensagens
de commit, nomes de branch e títulos de pull request.

O código em `src/` já está todo em inglês — mantenha assim.

## Requisitos

- **Node 24**, fixado no `.nvmrc` em `v24.22.1`; a configuração de debug do VS Code usa Node 24 via
  `runtimeVersion`. Os testes precisam de Node 24.9 ou mais novo: os pacotes do NestJS 12 são só ESM e o Jest 30 só
  consegue dar `require()` neles a partir dessa versão. O `engines` do `package.json` (`>=24`) vale para quem
  consome a biblioteca; ver [Dependências e ambientes](#dependências-e-ambientes). A 2.x exige Node 24;
  os serviços que ainda não migraram continuam na tag 1.x.
- **yarn 1.x** (clássico) — o `yarn.lock` do repositório é v1.
- Acesso de leitura à organização `Multiplan-MIND` no GitHub, já que a instalação é feita pela URL do
  git, não por um registry.

## Clone e instalação

```bash
git clone https://github.com/Multiplan-MIND/mind-api-helpers.git
cd mind-api-helpers
nvm use          # respeita o .nvmrc
yarn install
```

O `yarn install` **já compila o `dist/`**, por conta do ciclo declarado no `package.json`:

- `preinstall: yarn --ignore-scripts` instala a árvore de dependências incluindo as `devDependencies`,
  garantindo que o `typescript` exista;
- `postinstall: yarn build` compila `src/` em `dist/`, que é o que `main` e `types` apontam.

Isso existe porque o `dist/` não é versionado (está no `.gitignore`) e os serviços instalam esta
biblioteca direto do git — sem esse ciclo, o consumidor receberia o pacote sem código compilado.

## Scripts

| Comando             | O que faz                                                                                           |
| ------------------- | --------------------------------------------------------------------------------------------------- |
| `yarn build`        | `tsc -p tsconfig.build.json` gerando `dist/` sem os specs (o `prebuild` limpa a pasta com `rimraf`) |
| `yarn test`         | jest (com `--experimental-vm-modules`), configuração em `jest.config.json`                          |
| `yarn test:cov`     | jest com cobertura; falha se a cobertura de linhas ficar < 90%                                      |
| `yarn lint`         | eslint; o prettier roda como regra do eslint                                                        |
| `yarn lint-autofix` | o mesmo, com `--fix`                                                                                |

### Testes

Os testes ficam ao lado do código, como `*.spec.ts` (a pasta `test/` existe, mas está vazia).

```bash
yarn test                                   # tudo
yarn test src/mind-helpers                  # um diretório
yarn test -t 'should preserve subclasses'   # um teste pelo nome
yarn test --watch
yarn test:cov                               # com cobertura
```

O `coverageThreshold` de 90% (linhas, em `jest.config.json`) só vale para `yarn test:cov`: o `yarn test`
simples não é afetado, mas o `test:cov` falha se a cobertura cair abaixo disso.

O script `test` roda o Jest como `node --experimental-vm-modules ./node_modules/jest/bin/jest.js`. A flag é
obrigatória: o NestJS 12 só publica ESM, e sem ela o Jest falha com `Must use import to load ES Module`. Ao
chamar o Jest de outro jeito (`npx jest`, IDE), passe a flag também.

O VS Code tem a configuração de debug **"API Helpers - Jest"** em `.vscode/launch.json` (Node 24 via
`runtimeVersion`, com a mesma flag em `runtimeArgs`).

A suíte `with the real winston logger` roda com o winston de verdade, de propósito, então rodar os
testes **escreve arquivos em `logs/`** (pasta ignorada pelo git).

### Lint

Atenção ao script: o padrão `src/**/*.ts` é expandido pelo bash com `globstar` desligado, ou seja,
equivale a `src/*/*.ts`. Na prática, `src/index.ts`, `src/mind-graphql/entities/` e `src/mind-mongoose/`
**não são verificados**. Para checá-los, passe o caminho explicitamente:

```bash
npx eslint src/index.ts src/mind-mongoose/**/*.ts
```

O estilo é o do `.prettierrc` — aspas simples, 120 colunas, vírgula final, indentação de 2 espaços.
A mesma configuração está duplicada dentro do `.eslintrc.js`: ao mudar uma, mude a outra.

## Uso em um serviço

A dependência é declarada pela URL do git, fixada em uma tag:

```json
"dependencies": {
  "mind-api-helpers": "https://github.com/Multiplan-MIND/mind-api-helpers.git#1.4.0"
}
```

Durante o desenvolvimento de uma alteração também se aponta para uma branch
(`...mind-api-helpers.git#feature/minha-branch`), para validar contra o serviço antes de gerar a tag.

### Logger

`MindLoggerModule.forRoot()` precisa ser importado em cada módulo que injeta o logger:

```ts
@Module({
  imports: [MindLoggerModule.forRoot()],
  providers: [MinhaService],
})
export class MeuModule {}

@Injectable()
export class MinhaService {
  constructor(@MindLogger('MinhaService') private logger: MindLoggerService) {}

  async salvar() {
    const _log = logPrefix('salvar', ['id-123']);
    try {
      this.logger.info('Saving', _log);
    } catch (err) {
      const e = toError(err);
      this.logger.error(`Error saving: ${e.message}`, _log, e);
    }
  }
}
```

Dois detalhes que costumam gerar dúvida:

- O `@MindLogger('Nome')` registra o nome em uma lista no momento em que a classe é carregada, e o
  `forRoot()` transforma essa lista em providers. Se a classe decorada ainda não tiver sido importada
  quando o `forRoot()` roda, o provider não é criado e o Nest reclama de `MindLoggerService<Nome>`
  ausente — quase sempre é ordem de importação, não erro de digitação.
- O logger grava em `logs/<módulo>.log` **relativo ao diretório de execução** do processo — mas só fora
  de produção. Cor e arquivo dependem **apenas** do `NODE_ENV`:

  | `NODE_ENV`                      | cor no console | arquivo `logs/<módulo>.log` |
  | ------------------------------- | -------------- | --------------------------- |
  | exatamente `production`         | não            | não (só console)            |
  | qualquer outro valor ou ausente | sim            | sim                         |

### GraphQL

`GraphqlAuthJwksService` e `GraphqlAuthGatewayService` são duas implementações intercambiáveis de
`GqlOptionsFactory` para Apollo Federation 2. As duas montam o mesmo contexto de requisição
(`mindUserId`, `mindUserRoles`, `mindSessionExpiresIn`, `mindSessionId` e `mindRequestInfo`, ver
[Sessões e revogação](#sessões-e-revogação)):

- **JWKS** — valida o token `Bearer` contra o JWKS baixado de `JWKS_URL`, com a chave pública em cache
  no redis. Use na borda, onde o token chega do cliente.
- **Gateway** — confia nos headers `mind-user-id`, `mind-user-roles`, `mind-session-expires-in` e
  `mind-session-id` já injetados por quem está na frente (o router), além de `mind-request-ip`, o IP do
  cliente. Use atrás do router.

Ambas exigem que o serviço forneça um provider `REDIS_CLIENT` (um client `ioredis`). No
`GraphqlAuthJwksService`, em caso de falha (token inválido, sessão revogada, redis fora) o contexto
**lança** um `GraphQLError` `UNAUTHENTICATED` com status HTTP 401. Não pode ser `undefined`: o driver do
Apollo troca o contexto vazio por `{ req }` e a requisição seguiria como anônima, com status 200. O
`GraphQLError` vem do `graphql` do **serviço** (peer dependency, carregado com `require` na hora do erro): o
`graphql` não é devDependency da biblioteca, porque uma cópia aninhada faria o `instanceof` do Apollo falhar.
O `GraphqlAuthGatewayService` não rejeita: sem os headers de identidade o contexto é anônimo. Sem token, o
contexto também é anônimo (campos `null`), como antes. Token com a sessão apenas expirada também segue anônimo.

As duas exigem NestJS 12, `@nestjs/graphql`/`@nestjs/apollo` 14, `nest-winston` 2 e `@apollo/server` 5 (ver
`peerDependencies`) e compartilham as opções montadas por `buildMindGqlOptions`
(`graphql-options.builder.ts`); cada serviço só define o `context` (e o JWKS, o `path`). O
`@nestjs/apollo` carrega o `@as-integrations/express5` em tempo de execução, então o serviço precisa
tê-lo instalado (ele é peer dependency, e a falta dele avisa na instalação). O serviço JWKS publica em `/*splat/graphql` (o Express 5 exige curinga nomeado). Erros de
coerção de variáveis respondem 400, o padrão do Apollo Server 5. O resolver `JSON` é sempre registrado, e
`requireResolversToMatchSchema` é `'warn'`: um serviço sem nenhum campo `JSON` recebe um aviso no boot em
vez de falhar. Nas duas, `mindSessionExpiresIn` é um `Date`.

O `@link` de federação que o subgraph declara fica fixo em `getMindFederationConfig()`
(`getMindFederationConfig()` em `src/mind-graphql/graphql-federation.config.ts`, exportada pelo _barrel_; devolve
uma cópia nova a cada chamada):
`federation/v2.3` com as mesmas 11 diretivas que o NestJS 10 importava, na mesma ordem. Os padrões mais novos do
`@nestjs/graphql` (v2.12 no 13, v2.14 no 14) não são compostos pelo `@apollo/gateway` 2.4.x do `mind-api-router`
(`Invalid version ... for the federation feature`); a v2.3 é. Só suba essa versão junto com o gateway do router. Os
specs dos dois serviços conferem a linha exata do `@link` gerado, com o helper compartilhado
`src/mind-graphql/graphql-auth.spec-helper.ts` (fora do build e do lint, como os specs).

O pin só vale para quem usa estes serviços: **todo subgraph atrás do router deve usar o
`getMindFederationConfig()`**, inclusive o serviço que monta o `GraphQLModule` direto, com
`autoSchemaFile: { federation: getMindFederationConfig() }`. Com `federation: 2`, o subgraph publica o padrão do
`@nestjs/graphql` 14 (`federation/v2.14`) e a composição no router falha. Os specs da biblioteca conferem o
decorator do `@link`, não o SDL publicado: para esse, consulte `{ _service { sdl } }` no serviço. Enquanto o
`@apollo/gateway` do router não subir, as diretivas mais novas da federação (`@authenticated`,
`@requiresScopes`, `@policy`, `@cost`, `@listSize`) não ficam disponíveis nos subgraphs.

**Serviços em TypeScript 5.9 precisam de um `paths` no `tsconfig.json`.** O ciclo de instalação desta
biblioteca deixa uma segunda cópia do `@apollo/server` (e dos `@nestjs/*`) em
`node_modules/mind-api-helpers/node_modules`. O TypeScript 5.9 não junta as duas cópias, e o build do serviço
falha com `TS2322` no `useClass` do `GraphQLModule.forRootAsync(...)`: os tipos `HeaderMap` das duas cópias
`have separate declarations of a private property '__identity'`. O TypeScript 5.1 aceitava. A correção é
apontar o `@apollo/server` para a cópia da raiz em `compilerOptions`. Os alvos são relativos (`./node_modules/...`),
o que funciona mesmo quando o `baseUrl` está obsoleto no TypeScript 6. Isso só muda a resolução de tipos; o JS
gerado é o mesmo:

```json
"paths": {
  "@apollo/server": ["./node_modules/@apollo/server"],
  "@apollo/server/*": ["./node_modules/@apollo/server/*"]
}
```

```ts
GraphQLModule.forRootAsync<ApolloFederationDriverConfig>({
  driver: ApolloFederationDriver,
  imports: [CacheModule, MindLoggerModule.forRoot()],
  useClass: process.env.GRAPHQL_SERVICE === 'jwks' ? GraphqlAuthJwksService : GraphqlAuthGatewayService,
});
```

## Sessões e revogação

O contexto dos dois serviços de GraphQL carrega o id da sessão (`mindSessionId`), mas só o
`GraphqlAuthJwksService` **impõe** a revogação. O `GraphqlAuthGatewayService` não consulta o redis, não
lê `SESSION_REQUIRE_SID` e não valida `sid`: ele apenas copia o header `mind-session-id` para
`mindSessionId` (ou `null`, se ausente ou vazio) e confia que o router à frente já rejeitou sessões
revogadas. O router precisa, portanto, checar a revogação e repassar `mind-session-id`.

- **Claim `sid`** — o token JWT carrega o id da sessão no claim `sid`. O `GraphqlAuthJwksService` o expõe
  como `mindSessionId` (`null` em token legado, sem o claim). Se o claim existir, mas não for uma string
  não vazia (`''`, número, `null`), o token é rejeitado: nunca é tratado como legado.
- **Chave de revogação** — uma sessão revogada é marcada no redis em `mind:session:revoked:<sid>`, com
  valor `1` e TTL igual ao tempo que falta para a sessão expirar **mais 60 s de margem** para diferença
  de relógio entre quem revoga e quem valida. A chave é global: leitura e escrita ignoram o
  `REDIS_PREFIX` do serviço, então todos os serviços enxergam a mesma revogação. Os helpers ficam em
  `src/mind-session/session.helper.ts`.
  - `markSessionRevoked(redis, sid, ttlSeconds)` devolve `false` se a sessão já expirou (`ttlSeconds <= 0`)
    e lança `RangeError` se o TTL não for finito, ou `TypeError` se o `sid` for vazio.
  - `markSessionsRevoked(redis, items)` revoga várias de uma vez (deduplica por `sid`, ficando com o maior
    TTL) e devolve `{ revoked: string[]; failed: { sid, error }[] }` em vez de lançar no primeiro erro.
    O pipeline não é atômico, mas o `SET` é idempotente: repetir a chamada inteira é seguro.
- **`SESSION_REQUIRE_SID`** (só `GraphqlAuthJwksService`) — controla tokens legados, sem `sid`. Por
  padrão (vazio ou `false`, a fase de transição) o token é aceito, com log em nível `debug`, já que essa
  sessão não pode ser revogada. Com `true` ou `1` ele é rejeitado. Aceita só `true`, `false`, `1` e `0`
  (sem diferenciar maiúsculas, ignorando espaços nas pontas); **qualquer outro valor derruba o boot** do
  serviço, para que um erro de digitação não deixe a exigência desligada em silêncio. É lida uma vez, na
  construção do serviço.
- **Fail-closed** (só `GraphqlAuthJwksService`) — para um token com `sid`, se a sessão estiver revogada
  **ou** o redis estiver indisponível, a requisição é rejeitada com 401 `UNAUTHENTICATED`. Não há
  "na dúvida, aceita". O log da sessão revogada inclui IP e user agent.
- **`mindRequestInfo`** — os dois serviços colocam `mindRequestInfo` no contexto (`ip`, `userAgent` e os
  headers `acceptLanguage`, `acceptEncoding`, `secChUa`, `secChUaPlatform`, `secChUaMobile` e
  `xForwardedFor`).
  - **`ip`** — vem de `req.ip` (com `net.isIP()`; `null` se não for um IP), **nunca** do primeiro item de
    `X-Forwarded-For`, que é o valor enviado pelo próprio cliente. O serviço precisa configurar o
    `trust proxy` do Express com o número de proxies à frente (por exemplo `app.set('trust proxy', 1)`).
    O header bruto continua em `headers.xForwardedFor`, só para auditoria.
  - **Gateway** — atrás do router, `req.ip` seria o do próprio router. O `GraphqlAuthGatewayService`
    lê o IP do header `mind-request-ip`, que o router preenche com o IP do cliente (já resolvido pelo
    `trust proxy` dele), e o router copia `user-agent`, `accept-*` e `sec-ch-ua*` do cliente. Sem esses
    repasses `ip` e `userAgent` descrevem o router, e os dados não servem para auditoria.

### Premissas do redis

A checagem de revogação usa `EVAL` com a chave em `ARGV` (`numkeys = 0`), porque o `keyPrefix` do ioredis
só é aplicado a argumentos de chave e a chave de revogação é global. Isso assume **redis standalone, sem
ACL por prefixo** (a topologia atual dos ambientes). Em Redis Cluster o script falharia
("non local key in a cluster node") quando a chave caísse em outro slot, e um usuário ACL restrito a
`~<prefixo>:*` receberia `NOPERM`. Se a topologia mudar, trocar por um client sem prefixo
(`redis.duplicate({ keyPrefix: '' })`) com `EXISTS` e `SET` nativos e liberar `~mind:session:revoked:*`.

```ts
import { isSessionRevoked, markSessionRevoked } from 'mind-api-helpers';

await markSessionRevoked(redis, sid, ttlSeconds); // grava mind:session:revoked:<sid>
await isSessionRevoked(redis, sid); // true enquanto a chave existir
```

## Variáveis de ambiente

A biblioteca lê apenas quatro — quem as define é o serviço que a consome (ela não carrega `.env`):

| Variável              | Efeito                                                                                                                             |
| --------------------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| `DEBUG`               | qualquer valor definido sobe o nível do logger de `info` para `debug`                                                              |
| `NODE_ENV`            | `production` desliga a cor e o arquivo de log; outro valor mantém os dois                                                          |
| `JWKS_URL`            | endereço do documento JWKS usado pelo `GraphqlAuthJwksService`                                                                     |
| `SESSION_REQUIRE_SID` | `true`/`1` rejeita tokens sem `sid`; `false`/`0`/vazio os aceita (sem diferenciar maiúsculas, com trim); outro valor falha no boot |

O acesso ao redis não vem de variável: chega pelo provider `REDIS_CLIENT`, configurado no serviço.
A chave pública fica em cache sob `JWKS_PUBLIC_KEY` por um dia.

## Dependências e ambientes

Quase tudo o que o código importa em tempo de execução (`mongoose`, `ioredis`,
`graphql-type-json`, `winston`, `nest-winston`, `@nestjs/*`, `@apollo/server`) está em
`devDependencies`. As `peerDependencies` declaram o que o serviço precisa ter instalado: `@nestjs/common`
^12, `@nestjs/graphql` ^14, `@nestjs/apollo` ^14, `@apollo/server` ^5, `graphql` ^16.11, `nest-winston` ^2,
`winston` ^3, `graphql-type-json`, `ioredis`, `mongoose` ^9, `reflect-metadata` (0.1 ou 0.2) e
`@as-integrations/express5` ^1.1.2. Por causa dessas faixas, a biblioteca só serve para serviços já no NestJS 12.
Na prática, `mongoose`, `@nestjs/common`,
`@nestjs/graphql`, `@apollo/server`, `winston`, `nest-winston`, `ioredis`, `graphql-type-json` e
`reflect-metadata` são resolvidos a partir de `node_modules/mind-api-helpers/node_modules` (a cópia aninhada
instalada pelo `preinstall`); só o `graphql` é resolvido no `node_modules` da raiz do serviço. Por isso o
serviço pode ter versões diferentes das que esta biblioteca usa, e por isso existe o `paths` do `tsconfig`
descrito acima. Vale conferir o serviço antes de mexer nas versões.

**O Mongoose do serviço precisa estar na mesma major da biblioteca (hoje, a 9).** O `getQuery` cria os `ObjectId`
com o `mongoose` aninhado da própria biblioteca, e o driver do serviço recusa tipos de outra major do bson
(`BSONVersionError: Unsupported BSON version`). Por isso o peer é `^9.0.0` e não uma faixa de várias majors: a cada
major nova do Mongoose a biblioteca precisa de uma major própria, ou a falha volta, sem aviso na instalação.

Nunca adicione o `graphql` às `devDependencies`: uma segunda cópia dele dentro de
`node_modules/mind-api-helpers/node_modules` faz o serviço falhar com `Cannot determine a GraphQL input type`
nos _input types_ de `query.entities.ts`.

As `dependencies` têm só `axios` (usado por `error.helper.ts` e pelo serviço JWKS), `jsonwebtoken` e
`jwk-to-pem`, com versões exatas.

O `engines.node` é `>=24`: a biblioteca e os serviços que a consomem sobem juntos para o Node 24. O NestJS 12
só publica ESM, e um serviço CommonJS o carrega pelo `require(esm)` do Node. Para rodar os testes desta
biblioteca é preciso Node 24.9 ou mais novo (Jest 30).

## Versionamento e publicação

Não há publicação em registry. Liberar uma versão é:

1. subir o campo `version` do `package.json`;
2. criar a tag correspondente no commit em `master` — o padrão atual é sem o prefixo `v` (`1.4.0`);
   existe um `v1.1.0` antigo, que é exceção;
3. atualizar o `#tag` no `package.json` de cada serviço que consome a biblioteca.

`master` é a branch de release e carrega as tags; `develop` recebe a integração e é o alvo dos PRs do
dependabot.
