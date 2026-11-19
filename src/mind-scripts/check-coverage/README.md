# Gate de cobertura

Compara a cobertura do pull request com a da branch de base e falha o build quando alguma métrica configurada cai abaixo do piso.

A comparação usa dois arquivos `coverage-summary.json`, que o Jest gera em `coverage/` quando roda com `--coverage` e o reporter `json-summary`:

- o summary do PR, gerado pela execução atual dos testes;
- o summary do baseline, gerado na branch de base, como o develop, e guardado pela pipeline para os PRs seguintes. Ele é opcional e pode não existir, como na primeira execução.

## Como usar

O pacote instala o comando `mind-check-coverage`. No `package.json` do serviço:

```json
"scripts": {
  "check-coverage": "mind-check-coverage"
}
```

Na pipeline, depois dos testes com cobertura e de baixar o summary do baseline:

```sh
yarn check-coverage coverage/coverage-summary.json develop-coverage-summary.json
```

Os caminhos são relativos ao diretório em que o comando roda, que pelo `yarn` é a raiz do serviço.

## Mínimos

As métricas são as do summary: `lines`, `statements`, `functions` e `branches`. Cada uma tem o próprio mínimo, e a métrica sem mínimo não é verificada. Os mínimos vêm de três fontes, nesta ordem de prioridade:

1. A flag da métrica, como `--branches=80`, que vale só para ela.
2. O arquivo `coverageThreshold.json` na raiz do serviço, lido sozinho quando existe, ou o arquivo apontado por `--config=<arquivo>`:

   ```json
   {
     "$comment": "Mínimos de cobertura do comando mind-check-coverage",
     "lines": 90,
     "branches": 80,
     "enforceBeforeV1": true
   }
   ```

   Como o JSON não aceita comentário, a chave `$comment` fica reservada para um texto livre, ignorado pelo comando.

3. O padrão de 80% de linhas e 80% de branches, aplicado só quando nenhuma das fontes acima define mínimo.

## Regras

- Sem o summary do baseline, cada métrica passa se atingir o mínimo. O mesmo vale para a métrica que o baseline não tem, como num arquivo gerado antes de ela ser configurada.
- Com o baseline abaixo do mínimo, o piso é o próprio baseline: o PR pode ficar abaixo do mínimo, mas não pode regredir.
- Com o baseline no mínimo ou acima, o piso é o mínimo, e o PR pode cair até ele.
- O PR reprova quando qualquer métrica reprova, e o relatório mostra todas.
- Abaixo da versão 1.0 do `package.json` do serviço, a reprovação só é informada e o comando termina com sucesso, para não travar um projeto ainda em formação. A flag `--enforce-before-v1`, ou `"enforceBeforeV1": true` no arquivo, faz reprovar desde já. Sem versão válida no `package.json`, o gate vale.
- O comando termina com código 1 na reprovação que vale e em qualquer entrada inválida: summary do PR ausente, summary do PR sem percentual numérico numa métrica com mínimo, opção desconhecida, mínimo fora de 0 a 100, chave desconhecida no arquivo ou `--config` apontando para um arquivo que não existe.

## Exemplo de pipeline (Jenkins)

O gate precisa de duas etapas na pipeline do serviço: comparar a cobertura em todo build e publicar o summary do develop como baseline dos próximos PRs. O Jest precisa ter o `json-summary` em `coverageReporters`, que não vem no padrão:

```ts
coverageReporters: ['json-summary', 'text', 'lcov'],
```

Os stages abaixo vêm depois do stage que roda os testes com cobertura. Troque `<BUCKET>` pelo bucket da organização; `projectNameSlug` e `vaultPath` são as variáveis que o Jenkinsfile do serviço já define, e o caminho do Vault precisa ter as credenciais da AWS com acesso ao bucket.

```groovy
environment {
  coverageBaselineKey = "s3://<BUCKET>/mind-api/coverage/${projectNameSlug}/develop-coverage-summary.json"
}

stage("Check coverage") {
  steps {
    withVault([
      configuration: [timeout: 60],
      vaultSecrets: [[
        path: "${vaultPath}",
        engineVersion: 2,
        secretValues: [
          [envVar: "AWS_ACCESS_KEY_ID", vaultKey: "aws_access_key_id"],
          [envVar: "AWS_SECRET_ACCESS_KEY", vaultKey: "aws_secret_access_key"],
        ]
      ]]
    ]) {
      sh "aws s3 cp ${coverageBaselineKey} develop-coverage-summary.json || exit 0"

      sh '''#!/bin/bash
            unset NPM_CONFIG_PREFIX
            . /home/ubuntu/.nvm/nvm.sh
            nvm use
            yarn check-coverage coverage/coverage-summary.json develop-coverage-summary.json'''
    }
  }
  post {
    always {
      sh "rm -f develop-coverage-summary.json"
    }
  }
}

stage("Publish coverage baseline") {
  when {
    branch "develop"
  }
  steps {
    withVault([
      configuration: [timeout: 60],
      vaultSecrets: [[
        path: "${vaultPath}",
        engineVersion: 2,
        secretValues: [
          [envVar: "AWS_ACCESS_KEY_ID", vaultKey: "aws_access_key_id"],
          [envVar: "AWS_SECRET_ACCESS_KEY", vaultKey: "aws_secret_access_key"],
        ]
      ]]
    ]) {
      sh "aws s3 cp coverage/coverage-summary.json ${coverageBaselineKey}"
    }
  }
}
```

- O `|| exit 0` do download deixa o build seguir quando o baseline ainda não existe; nesse caso o gate compara só com os mínimos.
- A chave no bucket é fixa e sobrescrita a cada build do develop, então o bucket guarda um objeto por serviço e nada acumula.
- O summary publicado é o do Jest inteiro, com as quatro métricas, então passar a exigir uma métrica nova no `coverageThreshold.json` não pede republicar o baseline.
