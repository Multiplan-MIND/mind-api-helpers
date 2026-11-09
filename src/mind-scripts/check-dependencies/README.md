# Verificador de dependências

Testa se o serviço alcança cada dependência declarada no `dependencyChecks.json`, usando a configuração do ambiente em que roda e sem subir a aplicação.

Tem dois usos:

- **no deploy**, provar que a rede e as credenciais estão corretas antes do rollout;
- **no diagnóstico**, investigar um ambiente sem depender da aplicação no ar.

## Como usar

O pacote instala o comando `mind-check-dependencies`. No `package.json` do serviço:

```json
"scripts": {
  "check-dependencies": "mind-check-dependencies"
}
```

O comando lê o `dependencyChecks.json` da raiz do serviço, ou o arquivo apontado por `--config=<arquivo>`, relativo ao diretório em que roda. No Dockerfile, o arquivo precisa ser copiado para a imagem junto com o `package.json`.

```bash
yarn check-dependencies
yarn check-dependencies --config=dependencyChecks.local.json
```

## Tipos

| Tipo       | O que prova                                                                    | Campos e exemplos                                        |
| ---------- | ------------------------------------------------------------------------------ | -------------------------------------------------------- |
| `mongodb`  | conecta, faz `ping` e lista as coleções do banco, o que exige autorização nele | [dependencies/mongodb](dependencies/mongodb/README.md)   |
| `redis`    | grava e remove uma chave temporária sob o prefixo                              | [dependencies/redis](dependencies/redis/README.md)       |
| `rabbitmq` | conecta e confere, sem declarar, que cada exchange existe                      | [dependencies/rabbitmq](dependencies/rabbitmq/README.md) |
| `http`     | faz a requisição e confere o status e, se pedido, valores da resposta JSON     | [dependencies/http](dependencies/http/README.md)         |

Os campos de conexão do `mongodb`, do `redis` e do `rabbitmq` têm como padrão as variáveis dos serviços MIND, então o serviço que as segue declara só o tipo.

## Preenchimento do arquivo

O arquivo é um objeto JSON. Cada chave é o nome da dependência, que aparece no relatório como `dependency=<nome>`, e o valor tem:

| Chave             | Obrigatória     | O que faz                                                                                                                                               |
| ----------------- | --------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `type`            | sim             | um dos tipos da tabela acima                                                                                                                            |
| `enabled`         | não             | texto, com ou sem variável, como `"false"` entre aspas; vazio ou `false` pula a dependência (ver [Dependência desabilitada](#dependência-desabilitada)) |
| os campos do tipo | conforme o tipo | os listados no README do tipo; o campo omitido usa o padrão dele                                                                                        |

O nome é livre e precisa ser único no arquivo; o mesmo tipo pode aparecer várias vezes, cada uma com os próprios campos, como dois bancos MongoDB.

### Variáveis

Todo campo de texto aceita referências a variáveis de ambiente, sozinhas ou no meio do texto, e várias no mesmo campo. Números, booleanos e os campos de valor fixo, como o `method` e o `expect` do `http`, são lidos como estão.

| Modelo                                | Com a variável definida            | Com a variável ausente ou vazia              |
| ------------------------------------- | ---------------------------------- | -------------------------------------------- |
| `${API_URL}`                          | o valor                            | a etapa `environment` falha e cita `API_URL` |
| `${API_URL:-https://api.example.com}` | o valor                            | `https://api.example.com`                    |
| `${MONGO_OPTIONS:-}`                  | o valor                            | texto vazio, sem falha                       |
| `${API_URL}/health`                   | o valor seguido de `/health`       | falha, como no primeiro caso                 |
| `${ATLAS_USER}:${ATLAS_PASS}`         | os dois valores com `:` entre eles | falha citando cada variável que falta        |

A variável vazia conta como ausente, como o `${VAR:-}` do shell. O `.env` do diretório completa o ambiente, e a variável que o processo já tem vence, como no `ConfigModule` do Nest; no Kubernetes, as variáveis vêm do Secret ligado ao Job por `envFrom`.

### Dependência desabilitada

O `enabled` é resolvido antes dos demais campos. Vazio ou `false`, sem diferenciar maiúsculas, a dependência sai como pulada (`reason=disabled`) e as variáveis dela não são cobradas. Qualquer outro valor, como `true` ou uma URL, a habilita.

```json
{
  "mixpanel": {
    "type": "http",
    "enabled": "${TELEMETRY_ENABLED:-false}",
    "method": "HEAD",
    "url": "https://api.mixpanel.com",
    "acceptAnyStatus": true
  },
  "multi_api": {
    "type": "http",
    "enabled": "${MULTI_API_URL:-}",
    "url": "${MULTI_API_URL}/health"
  },
  "legado": {
    "type": "http",
    "enabled": "false",
    "url": "https://legado.example.com/status"
  }
}
```

O `mixpanel` só roda onde a telemetria está ligada; o `multi_api` só roda no ambiente que define a URL, e ali a URL é cobrada; o `legado` fica no arquivo sem rodar em lugar nenhum.

### Validação antes dos testes

O comando lê o arquivo inteiro antes de testar qualquer dependência, e falha sem testar nada quando:

| Problema                              | Mensagem                                                                      |
| ------------------------------------- | ----------------------------------------------------------------------------- |
| o arquivo não existe ou não é JSON    | `Failed to read <arquivo>: ...`                                               |
| o conteúdo não é objeto ou está vazio | `<arquivo> must hold a JSON object`, `<arquivo> declares no dependency`       |
| a dependência não é objeto            | `"<nome>" in <arquivo> must be an object`                                     |
| o tipo não existe                     | `type of "<nome>" in <arquivo> must be one of mongodb, redis, rabbitmq, http` |
| o `enabled` não é texto               | `enabled of "<nome>" in <arquivo> must be a string`                           |
| a chave não é campo do tipo           | `Unknown key "<chave>" in "<nome>" in <arquivo>`                              |
| o valor tem o formato errado          | `<campo> of "<nome>" in <arquivo> must be <formato>`                          |
| falta campo obrigatório               | `"<nome>" in <arquivo> needs <campo>`                                         |

Depois de ler, resolve as variáveis de todas as dependências habilitadas e junta na linha `environment` as variáveis ausentes, as portas fora de 1 a 65535 e as URLs inválidas.

### Exemplos completos

Um serviço MIND que segue as variáveis padrão e fala com uma API externa:

```json
{
  "mongodb": { "type": "mongodb" },
  "valkey": { "type": "redis" },
  "rabbitmq": { "type": "rabbitmq", "exchanges": ["webhook-created", "webhook-processed"] },
  "meta_graph_api": {
    "type": "http",
    "url": "${WHATSAPP_GRAPH_API_BASE_URL:-https://graph.facebook.com/v21.0}/${WHATSAPP_PHONE_NUMBER_ID}?fields=id",
    "headers": { "Authorization": "Bearer ${WHATSAPP_ACCESS_TOKEN}" }
  }
}
```

Um serviço com dois bancos, o principal pelas variáveis padrão e o de relatórios por variáveis próprias:

```json
{
  "mongodb": { "type": "mongodb" },
  "mongodb_relatorios": {
    "type": "mongodb",
    "hosts": "${REPORTS_MONGO_HOSTS}",
    "credentials": "${REPORTS_MONGO_USER_PASS}",
    "database": "${REPORTS_MONGO_DATABASE:-reports}"
  }
}
```

Um arquivo local para diagnóstico, rodado com `yarn check-dependencies --config=dependencyChecks.local.json` contra os containers da máquina:

```json
{
  "mongodb": { "type": "mongodb", "hosts": "localhost:27017", "credentials": "", "database": "app" },
  "valkey": { "type": "redis", "host": "localhost", "port": 6379 },
  "api_local": { "type": "http", "url": "http://localhost:3000/health" }
}
```

## Segredos

Cada tipo marca os campos secretos, listados no README dele. O valor de toda variável interpolada num campo secreto aparece como `***` em qualquer mensagem ou pilha registrada, inclusive na mensagem de erro que vem do driver. O texto fixo do arquivo não é segredo, então credencial nunca vai escrita no arquivo, só por variável.

## Relatório

O comando escreve pelo logger da biblioteca, com o módulo `DependencyCheck`, no formato que os serviços já usam:

```text
Dependency check finished | dependency=environment outcome=success durationMs=3
Dependency check finished | dependency=mongodb outcome=success durationMs=412
Dependency check finished | dependency=mixpanel outcome=skipped reason=disabled
Dependency check summary | success=1 failure=0 skipped=1
```

Com algum problema na linha `environment`, nenhuma dependência é testada. As demais rodam em paralelo e todas rodam mesmo depois de uma falha, para uma execução mostrar todos os problemas. Cada etapa tem 10 segundos, cada dependência 35 segundos no total, e o processo sai 2 segundos depois do resumo mesmo com algum socket aberto.

O comando termina com código 1 quando alguma dependência falha, quando a linha `environment` falha e quando o arquivo ou a opção são recusados.

## Drivers

Cada tipo carrega o próprio driver só quando o arquivo o usa: `mongoose` para `mongodb`, `ioredis` para `redis` e `amqplib` para `rabbitmq`; o `http` usa o `fetch` do Node. O `amqplib` é dependência opcional da biblioteca, e o tipo `rabbitmq` falha com `The amqplib package is not installed in the service` quando ele não está disponível.

## Estrutura

```text
check-dependencies/
├── check-dependencies-command.ts   entrada do comando mind-check-dependencies
├── check-dependencies.ts           liga o núcleo ao registro de tipos e escreve o relatório
├── core/                           núcleo genérico, que não conhece nenhum tipo
│   ├── index.ts                    o que o comando e os tipos importam do núcleo
│   ├── dependency-definition.ts    contrato de um tipo: campos e verificação
│   ├── fields.ts                   formatos de campo comuns a todos os tipos
│   ├── dependency-config.ts        leitura e validação do arquivo
│   ├── dependency-checks.ts        enabled e resolução dos campos de cada dependência
│   ├── template-resolver.ts        variáveis e segredos
│   ├── load-driver.ts              carga do driver só quando o tipo é usado
│   └── constants.ts                nome do arquivo e prazos
└── dependencies/
    ├── index.ts                    registro dos tipos aceitos no campo type
    └── <tipo>/
        ├── index.ts                campos, verificação e uso dos auxiliares
        ├── index.spec.ts
        ├── README.md               campos e exemplos de preenchimento
        └── ...                     auxiliares do tipo, como montar a URI
```

## Como adicionar um tipo

Um tipo novo é uma pasta em `dependencies/` e uma linha no registro. O núcleo valida o arquivo, resolve as variáveis, mascara os segredos e aplica os prazos a partir dos campos que o tipo declara, então os outros tipos não mudam, e o serviço que não declara o tipo novo no próprio arquivo não percebe a mudança.

O exemplo cria um tipo `grpc` que prova que o servidor aceita a conexão.

**1. Os campos e a verificação**, em `dependencies/grpc/index.ts`:

```ts
import { CHECK_TIMEOUT_MILLISECONDS, SettingsOf, defineDependency, field, loadDriver } from '../../core';

const fields = {
  address: field.text({ default: '${GRPC_ADDRESS}' }),
  tls: field.flag(),
};

export type GrpcSettings = SettingsOf<typeof fields>;

/** Espera o canal ficar pronto, o que prova a rede e, com TLS, o certificado. */
async function checkGrpc(settings: GrpcSettings): Promise<void> {
  const { Client, credentials } = await loadDriver('@grpc/grpc-js', () => import('@grpc/grpc-js'));
  const channelCredentials = settings.tls ? credentials.createSsl() : credentials.createInsecure();
  const client = new Client(settings.address, channelCredentials);
  try {
    await new Promise<void>((resolve, reject) =>
      client.waitForReady(Date.now() + CHECK_TIMEOUT_MILLISECONDS, (error) => (error ? reject(error) : resolve())),
    );
  } finally {
    client.close();
  }
}

export const grpc = defineDependency({ fields, check: checkGrpc });
```

O `defineDependency` infere o tipo de `settings` a partir dos campos: `address` chega como `string` e `tls` como `boolean`, já resolvidos. Os auxiliares que crescerem, como montar uma URI ou traduzir um erro do driver, vão para arquivos próprios na pasta, usados pelo `index.ts`.

**2. O registro**, em `dependencies/index.ts`:

```ts
export const DEPENDENCY_TYPES: Record<string, DependencyDefinition> = { mongodb, redis, rabbitmq, http, grpc };
```

**3. O driver**, como dependência opcional da biblioteca, para o serviço que não usa o tipo não precisar instalá-lo: `yarn add -D @grpc/grpc-js` e, no `package.json`, a faixa em `peerDependencies` com `"optional": true` em `peerDependenciesMeta`, como o `amqplib`.

**4. O spec**, em `dependencies/grpc/index.spec.ts`, com o driver mockado por `jest.mock` e os padrões conferidos pelo `resolveFields` de `dependencies/resolve-fields.spec-helper.ts`.

**5. A documentação**: o `README.md` da pasta, com os campos e exemplos, e a linha na tabela de [Tipos](#tipos).

No serviço, basta atualizar a biblioteca, instalar o driver e declarar a dependência:

```json
{
  "pagamentos_grpc": { "type": "grpc", "address": "${PAYMENTS_GRPC_ADDRESS}", "tls": true }
}
```

### Formatos de campo

Os formatos comuns ficam em `field`, importado de `core`. O campo sem `default` é obrigatório no arquivo; com `secret: true`, o valor das variáveis interpoladas nele é mascarado.

| Formato                             | Valor no arquivo                                   | Valor entregue à verificação               | Opções              |
| ----------------------------------- | -------------------------------------------------- | ------------------------------------------ | ------------------- |
| `field.text()`                      | texto com variáveis                                | `string`                                   | `default`, `secret` |
| `field.url()`                       | texto com variáveis, que precisa resultar numa URL | `string`                                   | `default`, `secret` |
| `field.port()`                      | número ou texto com variáveis, de 1 a 65535        | `number`                                   | `default`           |
| `field.textList()`                  | lista de textos com variáveis                      | `string[]`, vazia por padrão               | `secret`            |
| `field.textMap()`                   | objeto de textos com variáveis                     | `Record<string, string>`, vazio por padrão | `secret`            |
| `field.json()`                      | qualquer JSON, com variáveis só nos textos         | `unknown`, ausente por padrão              | `secret`            |
| `field.flag()`                      | `true` ou `false`                                  | `boolean`, `false` por padrão              | `default`           |
| `field.oneOf(valores, { default })` | um dos valores, sem variável                       | a união dos valores                        | `default`           |

O formato que só um tipo precisa fica na pasta dele, implementando a interface `Field` (`description`, `required`, `accepts` e `resolve`), como o `expect` em `dependencies/http/expectations.ts`. O `resolve` recebe o valor do arquivo, ou `undefined` quando ele falta, e chama `invalid` do contexto para o valor resolvido fora do formato, que entra na linha `environment`. Os campos não podem se chamar `type` nem `enabled`, que o núcleo lê em toda dependência.
