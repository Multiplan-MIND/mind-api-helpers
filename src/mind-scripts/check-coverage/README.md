# Gate de cobertura

Compara a cobertura de linhas do pull request com a do develop, pelos `coverage-summary.json` que o Jest gera com o reporter `json-summary`, e falha o build quando a cobertura cai abaixo do piso.

## Como usar

O pacote instala o comando `mind-check-coverage`. No `package.json` do serviço:

```json
"scripts": {
  "check-coverage": "mind-check-coverage"
}
```

Na pipeline, depois dos testes com cobertura e de baixar o summary publicado pelo develop:

```sh
yarn check-coverage [--enforce-before-v1] coverage/coverage-summary.json develop-coverage-summary.json
```

O summary do develop é opcional e pode não existir, como na primeira execução. Os caminhos são relativos ao diretório em que o comando roda, que pelo `yarn` é a raiz do serviço.

## Regras

- O mínimo é 90% de linhas.
- Sem o summary do develop, o PR passa se atingir o mínimo.
- Com o develop abaixo do mínimo, o piso é o próprio develop: o PR pode ficar abaixo do mínimo, mas não pode regredir.
- Com o develop no mínimo ou acima, o piso é o mínimo, e o PR pode cair até ele.
- Abaixo da versão 1.0 do `package.json` do serviço, a reprovação só é informada e o comando termina com sucesso, para não travar um projeto ainda em formação. A flag `--enforce-before-v1` faz reprovar desde já. Sem versão válida no `package.json`, o gate vale.
- O comando termina com código 1 na reprovação que vale, sem o summary do PR ou com um summary sem percentual numérico de linhas.
