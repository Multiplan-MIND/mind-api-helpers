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
- Acesso de leitura à organização `Multiplan-MIND` no GitHub. Para **consumir** a biblioteca, um token
  com escopo `read:packages` exposto como `NPM_TOKEN` (veja "Uso em um serviço").

## Clone e instalação

```bash
git clone https://github.com/Multiplan-MIND/mind-api-helpers.git
cd mind-api-helpers
nvm use          # respeita o .nvmrc
yarn install
```

O `dist/` não é versionado (está no `.gitignore`); rode `yarn build` para gerá-lo localmente. Quem
consome a biblioteca não precisa compilá-la: o pacote publicado no GitHub Packages já contém o
`dist/` pronto.

## Scripts

| Comando             | O que faz                                                         |
| ------------------- | ----------------------------------------------------------------- |
| `yarn build`        | `tsc` gerando `dist/` (o `prebuild` limpa a pasta com `rimraf`)   |
| `yarn test`         | jest, configuração em `jest.config.json` (`testRegex: .spec.ts$`) |
| `yarn lint`         | eslint; o prettier roda como regra do eslint                      |
| `yarn lint-autofix` | o mesmo, com `--fix`                                              |

### Testes

Os testes ficam ao lado do código, como `*.spec.ts` (a pasta `test/` existe, mas está vazia).

```bash
yarn test                                   # tudo
yarn test src/mind-helpers                  # um diretório
yarn test -t 'should preserve subclasses'   # um teste pelo nome
yarn test --watch
yarn test --coverage
```

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

A biblioteca é publicada no **GitHub Packages** sob o escopo `@multiplan-mind`. O serviço precisa de
duas coisas: um `.npmrc` apontando o escopo para o registry do GitHub, e a dependência declarada por
versão.

```ini
# .npmrc — versionado no serviço; não contém segredo
@multiplan-mind:registry=https://npm.pkg.github.com
//npm.pkg.github.com/:_authToken=${NPM_TOKEN}
always-auth=true
```

```json
"dependencies": {
  "@multiplan-mind/mind-api-helpers": "^2.0.0"
}
```

```ts
import { MindLogger, MindLoggerService, logPrefix } from '@multiplan-mind/mind-api-helpers';
```

O `always-auth=true` não é opcional: sem ele o yarn v1 não envia o header de autenticação para as
URLs de download que grava no `yarn.lock`, e o install falha com 401 na segunda execução. O
`${NPM_TOKEN}` é expandido do ambiente pelo yarn, então o arquivo pode ser commitado.

Para validar uma alteração contra um serviço antes de publicar, use `yarn link` ou aponte a
dependência para o caminho local (`"file:../mind-api-helpers"`), lembrando de rodar `yarn build`
aqui antes.

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
- O logger grava em `logs/<módulo>.log` **relativo ao diretório de execução** do processo.

### GraphQL

`GraphqlAuthJwksService` e `GraphqlAuthGatewayService` são duas implementações intercambiáveis de
`GqlOptionsFactory` para Apollo Federation 2. As duas montam o mesmo contexto de requisição
(`mindUserId`, `mindUserRoles`, `mindSessionExpiresIn`):

- **JWKS** — valida o token `Bearer` contra o JWKS baixado de `JWKS_URL`, com a chave pública em cache
  no redis. Use na borda, onde o token chega do cliente.
- **Gateway** — confia nos headers `mind-user-id`, `mind-user-roles` e `mind-session-expires-in` já
  injetados por quem está na frente. Use atrás do router.

Ambas exigem que o serviço forneça um provider `REDIS_CLIENT` (um client `ioredis`) e, em caso de
falha, retornam `undefined` em vez de lançar — os resolvers ficam sem contexto.

```ts
GraphQLModule.forRootAsync<ApolloFederationDriverConfig>({
  driver: ApolloFederationDriver,
  imports: [CacheModule, MindLoggerModule.forRoot()],
  useClass: process.env.GRAPHQL_SERVICE === 'jwks' ? GraphqlAuthJwksService : GraphqlAuthGatewayService,
});
```

## Variáveis de ambiente

A biblioteca lê apenas duas — quem as define é o serviço que a consome (ela não carrega `.env`):

| Variável   | Efeito                                                                |
| ---------- | --------------------------------------------------------------------- |
| `DEBUG`    | qualquer valor definido sobe o nível do logger de `info` para `debug` |
| `JWKS_URL` | endereço do documento JWKS usado pelo `GraphqlAuthJwksService`        |

O acesso ao redis não vem de variável: chega pelo provider `REDIS_CLIENT`, configurado no serviço.
A chave pública fica em cache sob `JWKS_PUBLIC_KEY` por um dia.

## Dependências e ambientes

Cada pacote está classificado pelo uso real — cruzando os `import` do fonte, os `require()` que
sobrevivem no `dist/` e os tipos que vazam nos `.d.ts` públicos:

| Bloco                 | O que vai nele                                                                                                                                  |
| --------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| `dependencies`        | `axios`, `jsonwebtoken`, `jwk-to-pem` — bibliotecas-folha, sem singleton compartilhado e que não aparecem nos tipos públicos. Instaladas junto. |
| `peerDependencies`    | `@nestjs/common`, `@nestjs/graphql`, `@nestjs/apollo`, `@apollo/server`, `graphql-type-json`, `ioredis`, `mongoose`, `nest-winston`, `winston`, `reflect-metadata` — quem precisa ser **a mesma instância** do serviço, ou aparece nos `.d.ts`. |
| `devDependencies`     | ferramentas de build/lint/teste, os `@types`, e uma cópia de cada peer para compilar aqui.                                                       |

Dois casos que parecem erro e não são:

- `@nestjs/core` e `rxjs` estão em `devDependencies` mas **não** em `peerDependencies`. O código não os
  usa; eles existem porque o barrel do `@nestjs/common` faz `require('rxjs/operators')` e o
  `TestingModule` herda tipos do `@nestjs/core`. Quem satisfaz esses peers é o serviço que declara o
  `@nestjs/common`, não esta biblioteca.
- `reflect-metadata` é peer sem nenhum `import`. O `dist/` chama `Reflect.metadata(...)` atrás de um
  guard `typeof Reflect.metadata === 'function'`: se o serviço não carregar o polyfill, os metadados
  são descartados **em silêncio** e a injeção de dependência do Nest quebra sem erro claro.

Ao subir a versão de um peer aqui, confira antes o que os serviços instalam — a versão declarada
precisa continuar compatível com todos eles.

## Versionamento e publicação

A biblioteca é publicada no **GitHub Packages** por GitHub Actions. O fluxo:

```
.deploy/create-release.sh   →  branch release/X.Y.Z + PR para master + PR para develop
merge do PR de master       →  publish.yml: valida, publica, cria a tag vX.Y.Z e a Release
```

O `create-release.sh` só sobe o `version` e abre os dois PRs — ele não publica nem cria tag. Quem faz
isso é o `.github/workflows/publish.yml`, disparado por push em `master`:

1. lê o `version` do `package.json`;
2. **se essa versão já estiver publicada, encerra sem fazer nada.** É o que torna o workflow
   idempotente: merge em `master` sem subir a versão é no-op, e reexecutar o job nunca falha;
3. roda `lint`, `test` e `build` — o mesmo portão do `ci.yml`, nada é publicado sem passar;
4. `npm publish`, autenticado com o `GITHUB_TOKEN` do próprio Actions (não há PAT a criar nem
   segredo a rotacionar para publicar);
5. cria a tag `vX.Y.Z` e a GitHub Release com notas geradas.

O `ci.yml` roda `lint`, `test` e `build` em todo PR e em push para `develop`/`master`.

`master` é a branch de release e carrega as tags; `develop` recebe a integração e é o alvo dos PRs do
dependabot.

### Migração da instalação por tag git (1.x → 2.x)

Até a 1.x os serviços instalavam pela URL do git (`...mind-api-helpers.git#1.5.0`) e compilavam a
biblioteca no `postinstall`. Isso fazia o `node_modules/mind-api-helpers` do serviço pesar **209 MB**,
com as `devDependencies` daqui aninhadas dentro dele — e, pior, o Node resolvia `winston`, `ioredis` e
`@nestjs/*` por essas cópias, não pelas do serviço. A 2.x acaba com isso: o pacote publicado tem
**16 kB** e só contém `dist/`.

As tags `1.x` continuam funcionando, então dá para migrar um serviço de cada vez. Por serviço:

1. adicionar o `.npmrc` (veja "Uso em um serviço") e cadastrar `NPM_TOKEN` no Vault;
2. trocar a dependência git por `"@multiplan-mind/mind-api-helpers": "^2.0.0"`;
3. `sed` nos imports: `from 'mind-api-helpers'` → `from '@multiplan-mind/mind-api-helpers'`;
4. **declarar os `peerDependencies` que faltarem** — sem o `node_modules` aninhado eles passam a ser
   exigidos de verdade. Levantamento em 26/08/2026: falta `mongoose` no `mind-api-router`, e
   `graphql-type-json`, `ioredis`, `nest-winston` e `winston` no `multi-api-loyalty`;
5. no `Dockerfile`, trocar `RUN --mount=type=ssh yarn --pure-lockfile` por
   `RUN --mount=type=secret,id=npmtoken NPM_TOKEN=$(cat /run/secrets/npmtoken) yarn install --frozen-lockfile`,
   e incluir o `yarn.lock` no `COPY` (hoje ele não é copiado, e o `--pure-lockfile` não tem efeito);
6. no `Jenkinsfile`, buscar `NPM_TOKEN` do Vault e repassá-lo com
   `docker build --secret id=npmtoken,env=NPM_TOKEN`.

O detalhe do `mind-api-router` merece atenção: entre a 1.3.0 e a 1.6.0 o `mongoose` deixou de ser
type-only (`query.helper.ts` passou a usar `new Types.ObjectId(...)`), então o barrel faz
`require('mongoose')`. Hoje isso resolve pela cópia aninhada; sem ela é `MODULE_NOT_FOUND` no boot.
