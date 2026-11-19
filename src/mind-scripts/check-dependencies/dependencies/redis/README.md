# redis

Grava e remove a chave `dependency-check:<uuid>` sob o prefixo, porque a aplicação escreve. A chave tem TTL de 60 segundos, que a apaga se o processo morrer no meio, e a remoção que não acha a chave prova que a gravação não ficou. Serve também para o Valkey. Usa o `ioredis` do serviço.

## Campos

| Campo       | Formato                       | Padrão                | Segredo |
| ----------- | ----------------------------- | --------------------- | ------- |
| `host`      | texto                         | `${REDIS_HOST}`       | não     |
| `port`      | número ou texto, de 1 a 65535 | `${REDIS_PORT:-6379}` | não     |
| `keyPrefix` | texto                         | `${REDIS_PREFIX:-}`   | não     |

O tipo não tem senha nem TLS; o Redis que exige um deles precisa de campo novo no tipo.

## Exemplos

Serviço MIND que segue as variáveis padrão, lendo `REDIS_HOST`, `REDIS_PORT` e `REDIS_PREFIX`:

```json
{ "valkey": { "type": "redis" } }
```

Prefixo fixo, para a chave de teste cair no espaço do serviço:

```json
{ "valkey": { "type": "redis", "keyPrefix": "mind:concierge:" } }
```

Dois Redis, o de cache pelas variáveis padrão e o de sessões por variáveis próprias, com porta numérica:

```json
{
  "cache": { "type": "redis" },
  "sessoes": {
    "type": "redis",
    "host": "${SESSION_REDIS_HOST}",
    "port": 6380,
    "keyPrefix": "${SESSION_REDIS_PREFIX:-session:}"
  }
}
```

## Falhas comuns

| Mensagem                                                | Causa provável                                             |
| ------------------------------------------------------- | ---------------------------------------------------------- |
| `connect ECONNREFUSED ...`, `getaddrinfo ENOTFOUND ...` | host ou porta errados, ou rede bloqueada                   |
| `port of "<nome>" must be a number between 1 and 65535` | a porta resolvida não é número; sai na linha `environment` |
| `Redis did not keep the key just written`               | a gravação não ficou, como numa réplica só de leitura      |
| `NOAUTH Authentication required.`                       | o Redis exige senha, que o tipo não envia                  |
