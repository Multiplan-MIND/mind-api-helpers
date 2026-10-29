# Observabilidade (OpenTelemetry)

O módulo `mind-observability` liga o SDK do OpenTelemetry com todas as instrumentações do pacote oficial (`@opentelemetry/auto-instrumentations-node`) e envia traces e métricas por OTLP a qualquer coletor compatível, sem nenhuma linha de instrumentação no serviço. A biblioteca não guarda decisão por serviço nem por ambiente: tudo vem das variáveis do processo, lidas na partida.

## Ativação

O `mind-api-helpers/observability` entra no comando que inicia a aplicação, sem mudar o código:

```bash
node -r mind-api-helpers/observability dist/main.js
```

O mesmo comando vale para serviço CommonJS e para serviço em ES module (`"type": "module"`). Além de iniciar o SDK, ele registra o hook síncrono do `import-in-the-middle` (`module.registerHooks`), que deixa as instrumentações alterarem também os módulos carregados por `import`.

Use `-r`, não `--import`: o resolvedor ESM do Node não completa a extensão, e `--import mind-api-helpers/observability` falha com `ERR_MODULE_NOT_FOUND`.

Quando as variáveis estão num `.env`, o Node precisa carregá-lo antes do `register`, porque a aplicação só lê o arquivo depois:

```bash
node --env-file-if-exists=.env -r mind-api-helpers/observability dist/main.js
nest start --exec "node --env-file-if-exists=.env -r mind-api-helpers/observability"
```

O Node não sobrescreve uma variável já definida no ambiente do processo, e sem o arquivo só avisa `.env not found` e segue.

No Dockerfile o comando vai no `CMD`. Evite o `NODE_OPTIONS`: a variável vale para todo processo Node do contêiner (`yarn`, CLI do Nest, migrations, scripts), e cada um subiria um SDK em nome do serviço. Nada que carregue `mongoose` ou `@nestjs/*` pode vir antes do `register`, porque as instrumentações só alteram um módulo ainda não carregado; por isso o `register` **não** é exportado pelo `src/index.ts`.

## Ligar e desligar

A telemetria liga quando `OTEL_EXPORTER_OTLP_ENDPOINT` está definida e `OTEL_SDK_DISABLED` não é `true` (em qualquer caixa). Em qualquer outro caso nada do SDK é carregado e o custo é zero, então um serviço sem nenhuma variável do OpenTelemetry sobe desligado.

A troca só vale no próximo início do processo, porque as instrumentações são aplicadas na carga dos módulos. Uma variável definida no ambiente real do processo (no Deployment, por exemplo) vence a do `.env`.

## O que é instrumentado

Todas as instrumentações do pacote oficial ficam ativas, cada uma inerte até a aplicação carregar o módulo dela: HTTP de entrada e de saída (inclui `axios`), `fetch`, Express, NestJS, MongoDB, Redis (`ioredis` e `redis`), RabbitMQ (`amqplib`), Kafka, PostgreSQL, MySQL, GraphQL, gRPC, AWS SDK, pino e as demais da lista oficial. As métricas incluem `http.server.request.duration` e `http.client.request.duration`, o runtime do Node (`nodejs.eventloop.*`, `v8js.*`) e CPU e memória do processo (`process.cpu.*`, `process.memory.usage`).

| Instrumentação | Padrão da biblioteca |
| --- | --- |
| `fs`, `dns`, `net` | desligadas: um span por arquivo ou conexão |
| `mongoose` | desligada: repetiria como span de modelo cada comando que a `mongodb` já registra |
| `winston` | desligada: o `MindLoggerService` já escreve o trace id na linha |
| `host-metrics` | ligada, só com as métricas do processo |
| `express` | sem spans de middleware |
| `ioredis` e `redis` | comando e chave mascarada, nunca os valores |
| `mongodb` | consultas com os valores trocados por `?` |
| `graphql` | sem spans por resolver |

`OTEL_NODE_DISABLED_INSTRUMENTATIONS` (por exemplo `pg,kafkajs`) tira instrumentações da lista. `OTEL_NODE_ENABLED_INSTRUMENTATIONS` substitui a lista inteira, inclusive os padrões acima: para ligar a `winston`, liste todas as que o serviço quer.

As rotas de saúde não geram trace: qualquer caminho terminado em `/health` ou `/health/live`, com qualquer prefixo. `TRACING_IGNORE_PATHS` acrescenta caminhos exatos.

Com o NestJS 12, que só publica ESM, a instrumentação `nestjs-core` do pacote oficial (que cobre até a 11) não gera os spans de controller e handler. A rota continua no span HTTP, pela instrumentação do Express.

Com a telemetria ligada, a partida fica cerca de 0,2 s mais lenta e o processo ocupa cerca de 40 MB a mais de memória, medidos em Node 24. O custo vem de carregar o pacote oficial, não do número de instrumentações ativas.

## Dado pessoal

Antes de sair do processo, telefone (com e sem DDI), CPF (com e sem pontuação) e e-mail viram `<redacted>` nos atributos `url.full`, `url.path`, `url.query`, `http.target`, `http.url`, `db.query.text` e `db.statement`. A chave do Redis sai mascarada e os valores dos comandos nunca saem. Timestamps em milissegundos e ids com mais de 11 dígitos passam. A máscara cobre só esses atributos; o coletor pode repetir os mesmos padrões em todos os atributos como segunda barreira.

## Recurso

Sem `OTEL_SERVICE_NAME`, o `service.name` e o `service.version` vêm do `package.json` do diretório de trabalho; `OTEL_SERVICE_NAME` e `OTEL_RESOURCE_ATTRIBUTES` vencem. O recurso traz também `service.instance.id` (um por processo, separa as réplicas), o id do contêiner, host, sistema operacional e processo, sem os argumentos da linha de comando.

O ambiente vai em `deployment.environment.name`, e no Kubernetes o pod e o namespace entram pela Downward API, na mesma variável:

```yaml
env:
  - name: POD_NAME
    valueFrom: { fieldRef: { fieldPath: metadata.name } }
  - name: POD_NAMESPACE
    valueFrom: { fieldRef: { fieldPath: metadata.namespace } }
  - name: OTEL_RESOURCE_ATTRIBUTES
    value: deployment.environment.name=<ambiente>,k8s.pod.name=$(POD_NAME),k8s.namespace.name=$(POD_NAMESPACE)
```

## AI SDK

Com o SDK ligado, o módulo registra duas integrações no registro global de telemetria do AI SDK (`globalThis.AI_SDK_TELEMETRY_INTEGRATIONS`), uma para traces e outra para métricas, que o `ai` 7 usa em toda chamada de `generateText`, `streamText` e `embed`. Cada chamada vira um span raiz, `invoke_agent <modelo>` quando tem ferramentas e `chat <modelo>` quando não tem, com um filho `chat <modelo>` por ida ao modelo (tokens, motivo de término, modelo da resposta) e um filho `execute_tool <ferramenta>` por execução de ferramenta. As chamadas HTTP, de banco e de fila feitas pelo provedor e pelas ferramentas aparecem aninhadas nesses spans. As métricas são `gen_ai.client.token.usage` (por `gen_ai.token.type`) e `gen_ai.client.operation.duration`.

Os nomes seguem a versão 1.44.0 das convenções GenAI, declarada como `schemaUrl` do tracer e do meter. Essas convenções ainda estão em desenvolvimento e renomeiam atributos entre versões.

Uma chamada que o AI SDK nunca encerra (um stream que ninguém lê até o fim, por exemplo) é fechada como erro, com `error.type=timeout`, depois de 10 minutos ou quando há mais de 1000 abertas.

Prompt, resposta, argumentos e resultado de ferramenta **nunca** são gravados, porque carregam dado de cliente. Uma chamada com `telemetry.integrations` próprio ou `telemetry.isEnabled: false` substitui a integração global e não gera esses spans. A biblioteca não depende do pacote `ai`: num serviço sem ele, o registro global fica sem uso.

## Log

Quando a chamada de log acontece dentro de um span, o `MindLoggerService` acrescenta ` | trace_id=<id> span_id=<id>` ao fim da linha. Os campos anteriores não mudam de posição, e sem telemetria a linha fica igual. `currentTraceId()` e `currentSpanIds()` devolvem os mesmos ids para quem precisar deles fora do log.

Um `warn` ou `error` dentro de um span marca o span com `mind.log.warn` ou `mind.log.error`. Um coletor com tail sampling usa essas marcas para guardar todo trace que tenha uma linha de aviso ou de erro; o `trace_id` de uma linha `info` só leva a um trace gravado quando ele entrou na amostragem.

## Encerramento

No `SIGTERM`, no `SIGINT` e no `beforeExit` o módulo descarrega os spans e as métricas pendentes (espera no máximo 5 s) e reenvia o sinal, para o processo encerrar normalmente. Se o serviço tiver um handler próprio do sinal, o reenvio fica a cargo dele; com os shutdown hooks do NestJS, o reenvio do Nest espera o descarregamento. Um serviço que encerre o processo por conta própria (`process.exit` num hook) chama antes `shutdownObservability()`, exportada pelo `src/index.ts`.

## Variáveis

| Variável | Efeito |
| --- | --- |
| `OTEL_EXPORTER_OTLP_ENDPOINT` | endereço do coletor (ex.: `http://<coletor>:4318`); sem ela a telemetria fica desligada |
| `OTEL_SDK_DISABLED` | `true` (em qualquer caixa) desliga a telemetria |
| `OTEL_SERVICE_NAME` | nome do serviço; sem ela, o `name` do `package.json` |
| `OTEL_RESOURCE_ATTRIBUTES` | atributos do recurso, como `deployment.environment.name` |
| `OTEL_EXPORTER_OTLP_PROTOCOL` | `http/protobuf` por padrão; `grpc` e `http/json` também valem |
| `OTEL_TRACES_EXPORTER` / `OTEL_METRICS_EXPORTER` | `otlp` por padrão; `console` para depurar sem coletor, `none` desliga o sinal |
| `OTEL_LOGS_EXPORTER` | desligado por padrão: o log segue pelo stdout e pelo arquivo |
| `OTEL_TRACES_SAMPLER` / `OTEL_TRACES_SAMPLER_ARG` | amostragem no serviço; quando o coletor deriva métricas dos spans, mantenha 100% no serviço e amostre no coletor |
| `OTEL_NODE_ENABLED_INSTRUMENTATIONS` / `OTEL_NODE_DISABLED_INSTRUMENTATIONS` | escolha das instrumentações, ver [O que é instrumentado](#o-que-é-instrumentado) |
| `OTEL_NODE_RESOURCE_DETECTORS` | troca os detectores de recurso da biblioteca pelos do pacote oficial |
| `OTEL_LOG_LEVEL` | diagnóstico do próprio OpenTelemetry; sem ela, a biblioteca escreve no `stderr` no máximo um erro de exportação a cada 5 minutos, com a contagem dos suprimidos |
| `TRACING_IGNORE_PATHS` | lista separada por vírgula de caminhos exatos sem trace; **soma-se** às rotas de saúde |

Se o SDK falhar ao iniciar, uma linha vai para o `stderr` e a aplicação segue sem telemetria.

## Versões

O `@opentelemetry/api` é declarado como faixa (`^1.10.0`), para o Yarn deduplicar com a cópia que outros pacotes do serviço trazem. O SDK só aceita cópias da API de mesma minor ou mais antigas, então a biblioteca avisa no `stderr`, na partida, quando encontra uma cópia mais nova na raiz do serviço ou dentro do `ai`: os spans e as métricas criados por ela seriam descartados sem erro. Nesse caso, alinhe as versões com um `resolutions` no serviço.

As demais dependências do OpenTelemetry são fixas na linha 0.300 do SDK (`sdk-node` 0.300.0, `auto-instrumentations-node` 0.82.0) e sobem juntas.
