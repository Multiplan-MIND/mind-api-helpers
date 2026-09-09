# Publicação do mind-api-helpers via GitHub Packages

Data: 2026-08-26
Status: aprovado, pronto para implementação

## Problema

`mind-api-helpers` é distribuído por URL git pinada numa tag:

```json
"mind-api-helpers": "https://github.com/Multiplan-MIND/mind-api-helpers.git#1.5.0"
```

Como `dist/` é gitignored, o consumidor precisa compilar o pacote depois de cloná-lo. É o que
faz o par de scripts no `package.json`:

```json
"preinstall":  "yarn --ignore-scripts",
"postinstall": "yarn build"
```

Consequências medidas em `mind-api-router` (com helpers 1.3.0 instalado):

- `node_modules/mind-api-helpers` ocupa **209 MB**, com **460 pacotes** num `node_modules`
  aninhado — as devDependencies do helpers, instaladas dentro do consumidor para viabilizar o
  build.
- O Node resolve a partir de `node_modules/mind-api-helpers/dist/…` e encontra o `node_modules`
  aninhado **antes** do consumidor. A biblioteca roda com as cópias dela, não com as do serviço:

  | Pacote | no consumidor | aninhado no helpers |
  |---|---|---|
  | `nest-winston` | 1.9.4 | 1.9.3 |
  | `axios` | 1.6.0 | 1.6.1 |
  | `@nestjs/common` | 10.1.3 | 10.1.3 (segunda instância) |

- Logo, as `peerDependencies` declaradas **nunca são exercidas** — todas são satisfeitas
  localmente pela cópia aninhada. A declaração vira documentação sem efeito.

Para `winston`/`nest-winston` a duplicação é um risco concreto: transports e formats de
instâncias distintas do módulo.

## Objetivo

Publicar o pacote já compilado num registry, de modo que o consumidor instale apenas `dist/`.
Isso elimina o `node_modules` aninhado, faz as `peerDependencies` passarem a valer, e derruba os
209 MB para o tamanho do próprio `dist` (~200 KB).

## Decisões

| Decisão | Escolha |
|---|---|
| Registry | GitHub Packages (`npm.pkg.github.com`) |
| Nome do pacote | `@multiplan-mind/mind-api-helpers` (escopo do owner é obrigatório) |
| Imports nos consumidores | Renomeados de verdade, sem alias — porém **depois**, projeto a projeto |
| Versão de estreia | `2.0.0` |
| Gatilho da publicação | push em `master` com versão ainda não publicada |
| Autenticação de leitura | `.npmrc` versionado com `${NPM_TOKEN}` + `--mount=type=secret` no Docker |
| CI | `ci.yml` (lint + test + build) em PR, além do gate dentro do publish |

Notas sobre as decisões que não são óbvias:

- **`2.0.0`**: a API TypeScript exportada não muda, mas o nome do pacote e o método de instalação
  mudam — nenhum consumidor sobe sem ação manual. Semver descreve o contrato com o consumidor, e
  o contrato de instalação quebrou. Também cria uma fronteira legível no histórico: `1.x` = tag
  git, `2.x` = registry.
- **Sem alias**: `"mind-api-helpers": "npm:@multiplan-mind/…"` funciona no yarn v1 e pouparia os 82
  imports, mas deixa uma indireção permanente — quem lê o import não acha o pacote no registry
  pelo nome, e Dependabot/audit enxergam o alias.
- **`create-release.sh` não é alterado.** O único papel dele é criar a branch `release/X.Y.Z` e os
  dois PRs (para `master` e `develop`). Tag e publicação passam a ser responsabilidade do workflow.

## Escopo desta entrega

**Dentro:** o repositório `mind-api-helpers` — `package.json`, os dois workflows, documentação de
consumo no README.

**Fora:** a migração dos 6 consumidores. Ela está especificada abaixo como guia, mas será
executada projeto a projeto, em outro momento.

---

## Parte 1 — `package.json`

```jsonc
{
  "name": "@multiplan-mind/mind-api-helpers",
  "version": "2.0.0",
  "private": false,
  "repository": {
    "type": "git",
    "url": "git+https://github.com/Multiplan-MIND/mind-api-helpers.git"
  },
  "publishConfig": {
    "registry": "https://npm.pkg.github.com"
  },
  "files": ["dist"],
  "main": "dist/index.js",
  "types": "dist/index.d.ts",
  "scripts": {
    "build": "tsc -p tsconfig.build.json",
    "prepublishOnly": "yarn build"
  }
}
```

Mudanças e o motivo de cada uma:

- `name` ganha o escopo — GitHub Packages recusa publicar pacote cujo escopo não seja o owner.
- `private: true` **precisa sair**: o npm se recusa a publicar com ele ligado.
- `repository` é obrigatório para o GitHub Packages associar o pacote ao repositório.
- `publishConfig.registry` evita publicar no npmjs.com por engano.
- `preinstall` e `postinstall` **são removidos** — é o que encerra o problema dos 209 MB.
- `prepublishOnly` é cinto de segurança: mesmo que alguém rode `npm publish` na mão, o `dist` sai
  atualizado. O workflow também builda explicitamente.

`dist/` permanece no `.gitignore`. Ele passa a existir apenas dentro do tarball publicado — o
problema é resolvido sem poluir os diffs dos PRs.

## Parte 2 — `.github/workflows/ci.yml`

Dispara em `pull_request` e em `push` para `develop` e `master`.

```
setup-node (node-version-file: .nvmrc, cache: yarn)
  → yarn install --frozen-lockfile
  → yarn lint
  → yarn test
  → yarn build
```

Job único, sem matriz: o Node é pinado em `.nvmrc` (v20.20.2) e não há suporte a múltiplas versões.

`--frozen-lockfile` faz o CI falhar se o `yarn.lock` estiver dessincronizado do `package.json`, em
vez de silenciosamente resolver outra árvore.

## Parte 3 — `.github/workflows/publish.yml`

Dispara em `push` para `master`. Permissões: `contents: write` (criar tag e Release) e
`packages: write` (publicar).

Passos:

1. Lê `version` do `package.json`.
2. Consulta o registry. **Se a versão já estiver publicada, encerra com sucesso sem publicar.**
   É o que torna o workflow idempotente: merges em `master` sem bump não publicam, e um re-run
   manual não falha.
3. `yarn install --frozen-lockfile`, `yarn lint`, `yarn test`, `yarn build` — nada é publicado sem
   passar pelo mesmo gate do CI.
4. `npm publish`, autenticado com o `GITHUB_TOKEN` que o próprio Actions injeta. Não há PAT a criar
   nem segredo a rotacionar para publicar.
5. `gh release create v$VERSION --generate-notes`, que cria a tag e a Release.

O fluxo de release completo passa a ser:

```
create-release.sh  →  branch release/X.Y.Z + PR para master + PR para develop
merge do PR de master  →  publish.yml: valida, publica, cria tag vX.Y.Z e Release
```

## Parte 4 — Guia de migração dos consumidores

Documentado no README. Executado projeto a projeto, fora desta entrega.

### 4.1 `.npmrc` (versionado no consumidor)

```ini
@multiplan-mind:registry=https://npm.pkg.github.com
//npm.pkg.github.com/:_authToken=${NPM_TOKEN}
always-auth=true
```

`always-auth=true` não é decorativo: sem ele, o yarn v1 não envia o header de autenticação para as
URLs de download que grava no `yarn.lock`, e o install falha com 401 na segunda execução.

O yarn v1 expande `${NPM_TOKEN}` a partir do ambiente, então o arquivo pode ser commitado sem
conter segredo.

### 4.2 `package.json` do consumidor

```diff
-"mind-api-helpers": "https://github.com/Multiplan-MIND/mind-api-helpers.git#1.5.0",
+"@multiplan-mind/mind-api-helpers": "^2.0.0",
```

### 4.3 Imports

```
from 'mind-api-helpers'  →  from '@multiplan-mind/mind-api-helpers'
```

Volume por repositório:

| Repositório | arquivos |
|---|---|
| mind-api-parking | 31 |
| mind-api-user | 19 |
| mind-api-payment | 16 |
| mind-api-webhook | 10 |
| mind-api-router | 4 |
| multi-api-loyalty | 2 |

### 4.4 Peers que passam a ser exigidos de verdade

Com o `node_modules` aninhado eliminado, o consumidor precisa declarar todos os peers. Levantamento
atual:

| Repositório | Falta |
|---|---|
| mind-api-parking, -payment, -webhook, -user | nada |
| **mind-api-router** | `mongoose` |
| **multi-api-loyalty** | `graphql-type-json`, `ioredis`, `nest-winston`, `winston` |

### 4.5 Dockerfile

```diff
-RUN --mount=type=ssh yarn --pure-lockfile
+RUN --mount=type=secret,id=npmtoken \
+    NPM_TOKEN=$(cat /run/secrets/npmtoken) yarn install --frozen-lockfile
```

O `--mount=type=secret` mantém o token fora das layers da imagem. O `COPY` precisa passar a
incluir o `yarn.lock` (ver "Riscos" abaixo).

### 4.6 Jenkinsfile

Buscar `NPM_TOKEN` do Vault, exportá-lo no stage de install e repassá-lo ao build com
`docker build --secret id=npmtoken,env=NPM_TOKEN`.

### 4.7 Passos manuais (fora do alcance do código)

1. Criar um PAT com escopo `read:packages` na organização.
2. Cadastrá-lo no Vault como `NPM_TOKEN`, no path de cada serviço.
3. Opcional: branch protection em `master` exigindo o check do `ci.yml`.

---

## Riscos e problemas pré-existentes que a migração expõe

Nenhum dos dois é causado por esta mudança, mas ambos passam a quebrar de verdade quando o
`node_modules` aninhado deixar de existir.

**1. `mind-api-router` não declara `mongoose`.** Entre a 1.3.0 e a 1.6.0, `mongoose` deixou de ser
type-only: `query.helper.ts` passou a usar `new Types.ObjectId(...)`, então o barrel `index.js`
agora faz `require("mongoose")`. Hoje isso resolve pela cópia aninhada. Sem ela é `MODULE_NOT_FOUND`
no boot. É pré-requisito da migração do router — ou declarar `mongoose`, ou parar de exportar
`mind-mongoose` pelo barrel.

**2. O Dockerfile dos serviços não copia o `yarn.lock`**, mas roda `yarn --pure-lockfile`. Hoje isso
já significa que a imagem resolve uma árvore diferente da do agente Jenkins. Com registry, significa
que ela pode pegar um `2.x` diferente do testado. O `COPY` precisa incluir o `yarn.lock`.

## Convivência durante a transição

As tags git `1.x` continuam existindo e funcionando. Um serviço ainda em
`…mind-api-helpers.git#1.5.0` e outro já em `@multiplan-mind/mind-api-helpers@^2.0.0` são caminhos
independentes — não há necessidade de migrar todos de uma vez.

## Critérios de aceite

1. `yarn lint`, `yarn test` e `yarn build` passam localmente e no `ci.yml`.
2. `npm pack --dry-run` lista **apenas** `dist/` (mais `package.json` e `README.md`), sem `src/`,
   sem `*.spec.*`, sem `node_modules`.
3. `preinstall` e `postinstall` não existem mais no `package.json`.
4. Merge em `master` publica `@multiplan-mind/mind-api-helpers@2.0.0` e cria a tag `v2.0.0` e a
   Release.
5. Um segundo push em `master` sem bump de versão **não** publica e **não** falha.
