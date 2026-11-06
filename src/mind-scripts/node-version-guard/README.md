# Guard de versão do Node

Confere, na partida da aplicação, se a versão do Node em execução está dentro da faixa declarada no `engines.node` do `package.json` do serviço. Se não estiver, encerra o processo com uma mensagem que explica o problema.

Sem o guard, rodar o serviço num Node que não suporta `require(esm)` derruba a aplicação com um `ERR_REQUIRE_ESM` ao carregar o NestJS 12, e esse erro não indica que a causa é a versão do Node. Com o guard, a mensagem informa:

- a faixa de versões exigida;
- a versão do Node em execução;
- o caminho do executável do Node;
- o `package.json` de onde a faixa foi lida.

## Como usar

As três formas executam o mesmo arquivo, e cabe ao serviço escolher uma:

| Forma | Onde fica | Quando usar |
| --- | --- | --- |
| Import | primeira linha do `main.ts`: `import 'mind-api-helpers/node-version-guard';`, ou `import 'mind-api-helpers/node-version-guard.js';` em serviço ES module | o guard vai junto com o código e roda em qualquer comando que suba a aplicação |
| `-r` | comando de start: `node -r mind-api-helpers/node-version-guard -r mind-api-helpers/observability dist/main.js` | o guard fica fora do código; precisa vir antes da observabilidade |
| Comando | passo separado, como `mind-node-guard && node dist/main.js` num shell, no CI ou no Dockerfile | a conferência roda antes da aplicação, com o `node` do `PATH`, e termina com código 0 quando a versão atende |

Em serviço ES module (`"type": "module"`), o import leva a extensão `.js`, porque o resolvedor ESM do Node não a completa e, sem ela, a partida falha com `ERR_MODULE_NOT_FOUND`. Pelo import e pelo `-r`, o guard precisa rodar antes de qualquer import do NestJS. Ele não passa pelo _barrel_ da biblioteca, que carrega o NestJS ao ser importado. Num script do `package.json` rodado pelo yarn 1.x, o próprio yarn recusa a execução quando o Node está fora do `engines` do projeto, com a mensagem dele, antes de o comando rodar.

## Comportamento

- A faixa vem do `engines.node` do `package.json` mais próximo, subindo a partir do diretório em que o processo roda, e é conferida com o `semver`.
- Fora da faixa, escreve a mensagem no stderr e encerra com código 1; dentro dela, não escreve nada.
- Também encerra com código 1 quando não acha o `package.json` ou quando o `engines.node` não é uma faixa válida, porque seguir sem a faixa desligaria a proteção em silêncio. Por isso a imagem do serviço precisa levar o `package.json`.

```text
[node-version-guard] This application requires Node >=24.22 <25 and is running on v22.23.2.
Executable: /usr/local/bin/node
The range is engines.node in /app/package.json, the one the application and its tests are verified on.
The project's Node version is pinned in its .nvmrc and in the base image of its Dockerfile.
```
