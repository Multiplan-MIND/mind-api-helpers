# mongodb

Conecta, faz `ping` e lista as coleções do banco configurado. A listagem exige autorização no banco, o que o `ping` sozinho não prova. Usa o `mongoose` do serviço.

## Campos

| Campo         | Formato                                              | Padrão                       | Segredo |
| ------------- | ---------------------------------------------------- | ---------------------------- | ------- |
| `protocol`    | texto                                                | `${MONGO_PROTOCOL:-mongodb}` | não     |
| `hosts`       | texto, um ou mais `host:porta` separados por vírgula | `${MONGO_HOSTS}`             | não     |
| `credentials` | texto `usuario:senha`, já codificado para URI        | `${MONGO_USER_PASS:-}`       | sim     |
| `database`    | texto                                                | `${MONGO_DATABASE}`          | não     |
| `options`     | texto de query string, com ou sem `?`                | `${MONGO_OPTIONS:-}`         | não     |

A URI é montada como nos serviços MIND, no formato `<protocol>://<credentials>@<hosts>/<database>?<options>`; sem credenciais, o `@` sai, e sem opções, o `?` sai. Como as credenciais entram na URI como estão, usuário e senha com caracteres como `@`, `:` ou `/` precisam estar codificados na variável, como `p%40ss` para `p@ss`.

## Exemplos

Serviço MIND que segue as variáveis padrão, lendo `MONGO_PROTOCOL`, `MONGO_HOSTS`, `MONGO_USER_PASS`, `MONGO_DATABASE` e `MONGO_OPTIONS`:

```json
{ "mongodb": { "type": "mongodb" } }
```

Atlas, com o protocolo `mongodb+srv` e usuário e senha em variáveis separadas:

```json
{
  "mongodb_atlas": {
    "type": "mongodb",
    "protocol": "mongodb+srv",
    "hosts": "${ATLAS_HOSTS}",
    "credentials": "${ATLAS_USER}:${ATLAS_PASS}",
    "database": "${ATLAS_DATABASE}",
    "options": "retryWrites=true&w=majority"
  }
}
```

Réplica set com usuário criado no banco `admin`:

```json
{
  "mongodb": {
    "type": "mongodb",
    "hosts": "mongo-1.example.com:27017,mongo-2.example.com:27017,mongo-3.example.com:27017",
    "options": "replicaSet=rs0&authSource=admin"
  }
}
```

Os campos omitidos continuam vindo das variáveis padrão, então esse exemplo ainda lê `MONGO_USER_PASS` e `MONGO_DATABASE`.

Dois bancos no mesmo serviço, o segundo por variáveis próprias e com banco padrão:

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

Banco local sem autenticação, mesmo com `MONGO_USER_PASS` no `.env`; o `credentials` vazio no arquivo vence o padrão:

```json
{ "mongodb": { "type": "mongodb", "hosts": "localhost:27017", "credentials": "", "database": "app" } }
```

## Falhas comuns

| Mensagem                                                                              | Causa provável                                                                             |
| ------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------ |
| `Server selection timed out ... \| topology=<tipo> servers=<host>=<estado>(<motivo>)` | rede, DNS, TLS ou réplica set sem primário; o motivo de cada servidor vem entre parênteses |
| `Authentication failed`                                                               | credenciais erradas ou usuário criado em outro banco, que pede `authSource` em `options`   |
| `not authorized on <banco> to execute command { listCollections ... }`                | o usuário autentica, mas não tem leitura no banco                                          |
| `The mongoose package is not installed in the service`                                | o serviço não tem o `mongoose`                                                             |
