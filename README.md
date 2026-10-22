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

```ts
GraphQLModule.forRootAsync<ApolloFederationDriverConfig>({
  driver: ApolloFederationDriver,
  imports: [CacheModule, MindLoggerModule.forRoot()],
  useClass: process.env.GRAPHQL_SERVICE === 'jwks' ? GraphqlAuthJwksService : GraphqlAuthGatewayService,
});
```

### Tracing (OpenTelemetry)

O módulo `mind-tracing` liga o SDK do OpenTelemetry e exporta os traces por OTLP/HTTP. Para ativá-lo, o
serviço importa o `register` **na primeira linha do `main.ts`**:

```ts
import 'mind-api-helpers/dist/mind-tracing/register';
import { NestFactory } from '@nestjs/core';
// ... demais imports
```

Atenção à ordem: nada que carregue `mongoose` ou `@nestjs/*` pode ser importado antes do `register`. As
instrumentações só conseguem alterar um módulo que ainda não foi carregado; importado antes, ele fica
sem spans. Por isso o `register` **não** é exportado pelo `src/index.ts` (o barrel carrega o `mongoose` ao
ser importado).

O tracing fica desligado quando `OTEL_EXPORTER_OTLP_ENDPOINT` não está definida ou quando
`OTEL_SDK_DISABLED=true`; nesse caso nada do SDK é carregado. Se o SDK falhar ao iniciar, uma linha vai
para o `stderr` e a aplicação segue sem tracing. Falhas de exportação (endpoint errado, coletor fora do ar)
também são registradas no `stderr`, mas só a primeira, em uma linha; defina `OTEL_LOG_LEVEL` para controlar
você mesmo os diagnósticos do OpenTelemetry (nesse caso a biblioteca não instala o logger dela).

**As variáveis `OTEL_*` (e `MIND_TRACING_IGNORE_PATHS`) precisam estar no ambiente real do processo**
(`env`/Secret do Kubernetes, `export`, `docker -e`). O `register` roda na primeira linha do `main.ts`, antes de
o `ConfigModule`/`dotenv` ler o arquivo `.env`; valores que só existem no `.env` chegam tarde demais e o
tracing fica desligado, sem aviso.

| Variável                      | Efeito                                                                                                                                 |
| ----------------------------- | -------------------------------------------------------------------------------------------------------------------------------------- |
| `OTEL_EXPORTER_OTLP_ENDPOINT` | endereço do coletor (ex.: `http://tempo.monitoring.svc.cluster.local:4318`); sem ela, desligado                                        |
| `OTEL_SDK_DISABLED`           | `true` desliga o tracing mesmo com o endpoint definido                                                                                 |
| `OTEL_SERVICE_NAME`           | nome do serviço nos traces (ex.: `mind-api-healthcheck`)                                                                               |
| `OTEL_METRICS_EXPORTER`       | assume `none` se ausente (o SDK, por padrão, tentaria exportar para `localhost:4318`)                                                  |
| `OTEL_LOGS_EXPORTER`          | assume `none` se ausente, pelo mesmo motivo                                                                                            |
| `OTEL_TRACES_SAMPLER`         | amostragem; recomendado `parentbased_traceidratio`                                                                                     |
| `OTEL_TRACES_SAMPLER_ARG`     | razão de amostragem; `1.0` é o valor da prova de conceito no healthcheck; a amostragem de produção é decisão posterior (a ideia é 10%) |
| `MIND_TRACING_IGNORE_PATHS`   | lista separada por vírgula de caminhos sem trace; **soma-se** ao padrão `/health/live`                                                 |

No `SIGTERM` o módulo descarrega os spans pendentes (espera no máximo 5 s) e reenvia o sinal, para o
processo encerrar normalmente. Se o serviço registrar o próprio handler de `SIGTERM`, o reenvio não
acontece e o encerramento fica a cargo desse handler.

Para manter uma única cópia de `@opentelemetry/api` (1.9.0), esta biblioteca declara
`"resolutions": { "@opentelemetry/api": "1.9.0" }`, mas o `resolutions` do Yarn só vale no projeto raiz.
Cada serviço que ativar o tracing deve incluir o mesmo bloco no próprio `package.json` e conferir com
`yarn why @opentelemetry/api`. Sem a resolução, o consumidor pode acabar com duas cópias (a 1.9.0 e uma 1.x mais
nova), o que pode fazer o SDK e as instrumentações não enxergarem um ao outro.

`currentTraceId()` devolve o `traceId` do span ativo, quando existe.

## Variáveis de ambiente

A biblioteca lê as duas variáveis abaixo — quem as define é o serviço que a consome (ela não carrega `.env`).
As variáveis do tracing (`OTEL_*` e `MIND_TRACING_IGNORE_PATHS`) estão na seção [Tracing](#tracing-opentelemetry):

| Variável   | Efeito                                                                |
| ---------- | --------------------------------------------------------------------- |
| `DEBUG`    | qualquer valor definido sobe o nível do logger de `info` para `debug` |
| `JWKS_URL` | endereço do documento JWKS usado pelo `GraphqlAuthJwksService`        |

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
