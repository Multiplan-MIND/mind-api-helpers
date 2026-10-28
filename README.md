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

- **Node v20.20.2**, a versão fixada no `.nvmrc` (a configuração de debug do VS Code aponta para esse
  caminho exato dentro do `$NVM_DIR`).
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

| Comando             | O que faz                                                         |
| ------------------- | ----------------------------------------------------------------- |
| `yarn build`        | `tsc` gerando `dist/` (o `prebuild` limpa a pasta com `rimraf`)   |
| `yarn test`         | jest, configuração em `jest.config.json` (`testRegex: .spec.ts$`) |
| `yarn test:cov`     | jest com cobertura; falha se a cobertura de linhas ficar < 90%    |
| `yarn lint`         | eslint; o prettier roda como regra do eslint                      |
| `yarn lint-autofix` | o mesmo, com `--fix`                                              |

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

O VS Code tem a configuração de debug **"API Helpers - Jest"** em `.vscode/launch.json`.

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

Ambas exigem que o serviço forneça um provider `REDIS_CLIENT` (um client `ioredis`). Em caso de falha
(token inválido, sessão revogada, redis fora, headers de identidade malformados) o contexto **lança**
um `GraphQLError` `UNAUTHENTICATED` com status HTTP 401. Não pode ser `undefined`: o driver do Apollo
troca o contexto vazio por `{ req }` e a requisição seguiria como anônima, com status 200. Sem token, o
contexto é anônimo (campos `null`), como antes. Token com a sessão apenas expirada também segue anônimo.

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

Quase tudo o que o código importa em tempo de execução (`mongoose`, `ioredis`, `jsonwebtoken`,
`jwk-to-pem`, `graphql-type-json`, `winston`, `nest-winston`, `@nestjs/*`, `@apollo/server`) está em
`devDependencies`, e só `@nestjs/common` e `winston` estão declarados como `peerDependencies`. Em
produção essas bibliotecas são resolvidas no `node_modules` **do serviço**, não no desta biblioteca —
então subir uma versão aqui pode divergir do que os serviços instalam. Vale conferir o serviço antes
de mexer nas versões.

O `axios`, usado por `error.helper.ts` e pelo serviço JWKS, não está declarado: ele só aparece porque
a única entrada em `dependencies`, o pacote descontinuado `@types/axios`, depende de `axios: "*"`.

## Versionamento e publicação

Não há publicação em registry. Liberar uma versão é:

1. subir o campo `version` do `package.json`;
2. criar a tag correspondente no commit em `master` — o padrão atual é sem o prefixo `v` (`1.4.0`);
   existe um `v1.1.0` antigo, que é exceção;
3. atualizar o `#tag` no `package.json` de cada serviço que consome a biblioteca.

`master` é a branch de release e carrega as tags; `develop` recebe a integração e é o alvo dos PRs do
dependabot.
