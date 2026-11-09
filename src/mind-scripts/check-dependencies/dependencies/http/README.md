# http

Faz uma requisição e exige status 2xx, sem seguir redirecionamento. Com `expect`, confere também valores da resposta JSON. Usa o `fetch` do Node, sem driver.

## Campos

| Campo             | Formato                                                  | Padrão      | Segredo |
| ----------------- | -------------------------------------------------------- | ----------- | ------- |
| `url`             | texto que resulte numa URL                               | obrigatório | não     |
| `method`          | `GET`, `HEAD` ou `POST`, sem variável                    | `GET`       | não     |
| `headers`         | objeto de textos                                         | nenhum      | sim     |
| `body`            | qualquer JSON                                            | nenhum      | sim     |
| `acceptAnyStatus` | `true` ou `false`                                        | `false`     | não     |
| `expect`          | objeto de caminho para texto, número, booleano ou `null` | nenhum      | não     |

Só há métodos de leitura, porque o comando roda contra produção; o `POST` fica para consultas, como a do GraphQL. Credencial vai em `headers` ou `body`, que são secretos; a `url` não é, então token em query string só aparece mascarado se o mesmo valor também estiver num campo secreto.

O `body` em objeto ou lista vai como JSON, com `content-type: application/json` quando os `headers` não definem outro; em texto, vai como está. O `fetch` recusa corpo em `GET` e `HEAD`.

O `acceptAnyStatus: true` aceita qualquer status, inclusive o redirecionamento, para provar só que o host responde, como na API que não tem rota de leitura.

O `expect` mapeia caminhos com ponto da resposta JSON para o valor esperado, comparado com igualdade estrita: `"data.count": 0` não aceita `"0"`. Índices de lista entram no caminho, como `data.items.0.id`. A mensagem de falha cita só o caminho e o esperado, nunca o valor recebido, que pode trazer dado da API.

## Exemplos

Rota de saúde sem autenticação:

```json
{ "api_pagamentos": { "type": "http", "url": "${PAYMENTS_API_URL}/health" } }
```

Bearer token, com a versão da API no padrão da URL:

```json
{
  "meta_graph_api": {
    "type": "http",
    "url": "${WHATSAPP_GRAPH_API_BASE_URL:-https://graph.facebook.com/v21.0}/${WHATSAPP_PHONE_NUMBER_ID}?fields=id",
    "headers": { "Authorization": "Bearer ${WHATSAPP_ACCESS_TOKEN}" }
  }
}
```

Chave de API em cabeçalho próprio:

```json
{
  "ai_provider": {
    "type": "http",
    "url": "https://generativelanguage.googleapis.com/v1beta/models/${AI_MODEL}",
    "headers": { "x-goog-api-key": "${GOOGLE_GENERATIVE_AI_API_KEY}" }
  }
}
```

Host que só recebe escrita, provado com `HEAD` e qualquer status, e só no ambiente com telemetria ligada:

```json
{
  "mixpanel": {
    "type": "http",
    "enabled": "${TELEMETRY_ENABLED:-false}",
    "method": "HEAD",
    "url": "${MIXPANEL_API_BASE_URL:-https://api.mixpanel.com}",
    "acceptAnyStatus": true
  }
}
```

GraphQL, conferindo que a resposta veio do schema e não de uma página de erro com status 200:

```json
{
  "multi_api": {
    "type": "http",
    "enabled": "${MULTI_API_URL:-}",
    "method": "POST",
    "url": "${MULTI_API_URL}",
    "headers": { "client-token": "${MULTI_API_CLIENT_TOKEN:-}" },
    "body": { "query": "{ __typename }" },
    "expect": { "data.__typename": "Query" }
  }
}
```

Corpo em texto, com o `content-type` dado no arquivo:

```json
{
  "oauth": {
    "type": "http",
    "method": "POST",
    "url": "${OAUTH_URL}/token/introspect",
    "headers": { "content-type": "application/x-www-form-urlencoded" },
    "body": "token=${OAUTH_PROBE_TOKEN}&client_id=${OAUTH_CLIENT_ID}"
  }
}
```

Vários valores da resposta, inclusive em lista:

```json
{
  "catalogo": {
    "type": "http",
    "url": "${CATALOG_API_URL}/status",
    "expect": { "status": "ok", "database.connected": true, "regions.0.name": "sa-east-1" }
  }
}
```

## Falhas comuns

| Mensagem                                                      | Causa provável                                                                          |
| ------------------------------------------------------------- | --------------------------------------------------------------------------------------- |
| `url of "<nome>" is not a valid URL`                          | a URL resolvida não é válida, como sem `https://`; sai na linha `environment`           |
| `fetch failed \| cause=ENOTFOUND`                             | DNS não resolve o host                                                                  |
| `fetch failed \| cause=ECONNREFUSED`                          | nada escuta na porta                                                                    |
| `fetch failed \| cause=<motivo>`                              | TLS, redirecionamento sem `acceptAnyStatus` ou outro erro de rede, com o motivo do Node |
| `Unexpected HTTP status \| httpStatus=401`                    | credencial ausente ou errada; outros status indicam rota ou método errados              |
| `Unexpected response body \| path=<caminho> expected=<valor>` | o JSON não tem o valor esperado no caminho, ou a resposta não é JSON                    |
| `The operation was aborted due to timeout`                    | a resposta passou de 10 segundos                                                        |
