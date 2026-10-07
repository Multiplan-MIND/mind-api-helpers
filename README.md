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

- **Node 24**, a versão fixada no `.nvmrc` (a configuração de debug do VS Code usa a mesma versão via
  `runtimeVersion`). Os testes precisam de Node 24.9 ou mais novo: os pacotes do NestJS 12 são só ESM e o
  Jest 30 só consegue dar `require()` neles a partir dessa versão.
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

| Comando             | O que faz                                                            |
| ------------------- | -------------------------------------------------------------------- |
| `yarn build`        | `tsc` gerando `dist/` (o `prebuild` limpa a pasta com `rimraf`)      |
| `yarn test`         | jest (com `--experimental-vm-modules`), config em `jest.config.json` |
| `yarn lint`         | eslint; o prettier roda como regra do eslint                         |
| `yarn lint-autofix` | o mesmo, com `--fix`                                                 |

### Testes

Os testes ficam ao lado do código, como `*.spec.ts` (a pasta `test/` existe, mas está vazia).

```bash
yarn test                                   # tudo
yarn test src/mind-helpers                  # um diretório
yarn test -t 'should preserve subclasses'   # um teste pelo nome
yarn test --watch
yarn test --coverage
```

O script `test` roda o Jest como `node --experimental-vm-modules ./node_modules/jest/bin/jest.js`. A flag é
obrigatória desde a `1.10.0`: o NestJS 12 só publica ESM, e sem ela o Jest falha com
`Must use import to load ES Module`. Ao chamar o Jest de outro jeito (`npx jest`, IDE), passe a flag também.

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

A `1.10.0` é a versão publicada com NestJS 12, Apollo Server 5, Mongoose 7|8|9 e o `@link` de federação fixo em
v2.3. As mudanças incompatíveis de peers e de engine saem como minor da linha 1.x porque o nome `2.0.0` já está
ocupado pela linha do GitHub Packages. As duas exigem NestJS 12, `@nestjs/graphql`/`@nestjs/apollo` 14,
`nest-winston` 2 e `@apollo/server` 5 (ver `peerDependencies`). O `@nestjs/apollo` carrega o
`@as-integrations/express5` em tempo de execução, então o serviço precisa tê-lo instalado (ele é peer
dependency, e a falta dele avisa na instalação). O serviço
JWKS publica em `/*splat/graphql` (sintaxe do Express 5, equivalente ao antigo `/*/graphql`), e as
duas mantêm o status 200 do Apollo 4 para erros de coerção de variáveis
(`status400ForVariableCoercionErrors: false`) e, como o `@nestjs/graphql` 12, ignoram o resolver `JSON`
quando nenhum campo usa esse scalar (`requireResolversToMatchSchema: 'ignore'`).

O `@link` de federação que o subgraph declara fica fixo em `MIND_FEDERATION_CONFIG`
(`src/mind-graphql/graphql-federation.config.ts`): `federation/v2.3` com as mesmas 11 diretivas que o
NestJS 10 importava. Os padrões mais novos do `@nestjs/graphql` (v2.12 no 13, v2.14 no 14) não são
compostos pelo `@apollo/gateway` 2.4.x do `mind-api-router`. Por isso a `1.10.0` fixa v2.3. Só
suba essa versão junto com o gateway do router.

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

## Variáveis de ambiente

A biblioteca lê apenas duas — quem as define é o serviço que a consome (ela não carrega `.env`):

| Variável   | Efeito                                                                |
| ---------- | --------------------------------------------------------------------- |
| `DEBUG`    | qualquer valor definido sobe o nível do logger de `info` para `debug` |
| `JWKS_URL` | endereço do documento JWKS usado pelo `GraphqlAuthJwksService`        |

O acesso ao redis não vem de variável: chega pelo provider `REDIS_CLIENT`, configurado no serviço.
A chave pública fica em cache sob `JWKS_PUBLIC_KEY` por um dia.

## Dependências e ambientes

Quase tudo o que o código importa em tempo de execução (`mongoose`, `ioredis`, `jsonwebtoken`,
`jwk-to-pem`, `graphql-type-json`, `winston`, `nest-winston`, `@nestjs/*`, `@apollo/server`) está em
`devDependencies`. As `peerDependencies` declaram o que o serviço precisa ter instalado: `@nestjs/common`
^12, `@nestjs/graphql` ^14, `@nestjs/apollo` ^14, `@apollo/server` ^5, `nest-winston` ^2, `winston` ^3,
`graphql-type-json`, `ioredis`, `mongoose` (7, 8 ou 9), `reflect-metadata` (0.1 ou 0.2) e `@as-integrations/express5`. Por causa dessas
faixas, a `1.10.0` só serve para serviços já no NestJS 12. Na prática, `mongoose`, `@nestjs/common`,
`@nestjs/graphql`, `@apollo/server`, `winston`, `nest-winston`, `ioredis`, `graphql-type-json` e
`reflect-metadata` são resolvidos a partir de `node_modules/mind-api-helpers/node_modules` (a cópia aninhada
instalada pelo build do `postinstall`); só o `graphql` é resolvido no `node_modules` da raiz do serviço. Por isso
o serviço pode ter versões diferentes das que esta biblioteca usa, e por isso existe o `paths` do `tsconfig`
descrito acima. Vale conferir o serviço antes de mexer nas versões.

As `dependencies` têm só `axios` (usado por `error.helper.ts` e pelo serviço JWKS), `jsonwebtoken` e
`jwk-to-pem`, com versões exatas.

O `engines.node` é `>=20.19.0` desde a `1.10.0`: o NestJS 12 só publica ESM, e um serviço CommonJS o carrega
pelo `require(esm)` do Node, liberado sem flag a partir da 20.19. Para rodar os testes desta biblioteca é
preciso Node 24.9 ou mais novo (Jest).

## Versionamento e publicação

Não há publicação em registry. Liberar uma versão é:

1. subir o campo `version` do `package.json`;
2. criar a tag correspondente no commit em `master` — o padrão atual é sem o prefixo `v` (`1.4.0`);
   existe um `v1.1.0` antigo, que é exceção;
3. atualizar o `#tag` no `package.json` de cada serviço que consome a biblioteca.

`master` é a branch de release e carrega as tags; `develop` recebe a integração e é o alvo dos PRs do
dependabot.
