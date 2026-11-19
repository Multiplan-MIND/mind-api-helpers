# rabbitmq

Conecta, abre um canal e confere que cada exchange da lista existe, sem declarar nada, porque quem cria o exchange é quem publica. Sem exchanges, prova só a conexão e as credenciais no vhost. Usa o `amqplib`, dependência opcional da biblioteca.

## Campos

| Campo       | Formato                       | Padrão                   | Segredo |
| ----------- | ----------------------------- | ------------------------ | ------- |
| `protocol`  | texto, `amqp` ou `amqps`      | `${AMQP_PROTOCOL:-amqp}` | não     |
| `user`      | texto                         | `${AMQP_USER}`           | sim     |
| `password`  | texto                         | `${AMQP_PASS}`           | sim     |
| `host`      | texto, só o host              | `${AMQP_URL}`            | não     |
| `port`      | número ou texto, de 1 a 65535 | `${AMQP_PORT:-5672}`     | não     |
| `vhost`     | texto                         | `${AMQP_VHOST}`          | não     |
| `exchanges` | lista de textos               | vazia                    | não     |

O usuário, a senha e o vhost são codificados na URI pelo próprio tipo, então vão na variável como são; o vhost padrão do broker é escrito como `/`.

## Exemplos

Serviço MIND que segue as variáveis padrão e confere os exchanges que consome:

```json
{ "rabbitmq": { "type": "rabbitmq", "exchanges": ["webhook-created", "webhook-processed"] } }
```

Broker gerenciado com TLS, na porta 5671 e no vhost padrão:

```json
{
  "rabbitmq": {
    "type": "rabbitmq",
    "protocol": "amqps",
    "port": 5671,
    "vhost": "/",
    "exchanges": ["pedidos"]
  }
}
```

Protocolo e porta exigidos pelo ambiente, sem o padrão, para a variável ausente falhar na linha `environment` em vez de cair no `amqp` 5672:

```json
{
  "rabbitmq": {
    "type": "rabbitmq",
    "protocol": "${AMQP_PROTOCOL}",
    "port": "${AMQP_PORT}",
    "exchanges": ["webhook-created"]
  }
}
```

Exchange cujo nome muda por ambiente:

```json
{ "rabbitmq": { "type": "rabbitmq", "exchanges": ["${ORDERS_EXCHANGE:-orders}", "audit"] } }
```

## Falhas comuns

| Mensagem                                                      | Causa provável                                   |
| ------------------------------------------------------------- | ------------------------------------------------ |
| `connect ECONNREFUSED ...`, `getaddrinfo ENOTFOUND ...`       | host ou porta errados, ou rede bloqueada         |
| `... ACCESS_REFUSED ...`                                      | usuário ou senha errados                         |
| `... NOT_ALLOWED - access to vhost ...`                       | o usuário não tem permissão no vhost             |
| `... NOT_FOUND - no exchange '<exchange>' in vhost '<vhost>'` | o exchange ainda não foi criado por quem publica |
| `The amqplib package is not installed in the service`         | o serviço não tem o `amqplib`                    |
