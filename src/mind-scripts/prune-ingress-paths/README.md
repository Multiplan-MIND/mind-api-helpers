# Limpeza de caminhos inválidos do ingress

Remove do arquivo de ingress do Kubernetes os caminhos cujo backend aponta para um nome de Service que o cluster recusaria. Quando o arquivo de ingress é um só para todos os branches, uma entrada inválida gravada por um build derruba o `kubectl apply` de todos os seguintes, e removê-la antes do apply devolve a pipeline ao normal sem edição manual do arquivo.

## Como usar

O pacote instala o comando `mind-prune-ingress-paths`. No `package.json` do serviço:

```json
"scripts": {
  "prune-ingress-paths": "mind-prune-ingress-paths"
}
```

Na pipeline, depois de baixar o arquivo de ingress e antes de acrescentar o caminho do branch:

```sh
yarn prune-ingress-paths ingress.yml
```

O caminho é relativo ao diretório em que o comando roda, que pelo `yarn` é a raiz do serviço.

## Comportamento

- Um nome de Service válido é um rótulo DNS-1035: minúsculas, dígitos e hífen, começando por letra, terminando por letra ou dígito e com no máximo 63 caracteres. O caminho com outro nome sai, e a regra que fica sem caminho nenhum sai junto, porque o Kubernetes também recusa `http.paths` vazio. O caminho cujo backend não é um Service fica. Quando um Ingress perde todas as regras e não tem `defaultBackend`, o cluster continua a recusá-lo, e o log avisa.
- O arquivo pode ter vários documentos YAML, e todos são verificados. Ele só é reescrito quando algum caminho sai, para não reformatar a cada build um arquivo que outras pipelines também editam; os comentários são mantidos.
- Como o comando reescreve o arquivo que recebe, só aceita um `.yml` ou `.yaml` dentro do diretório em que roda, inclusive depois de resolver links simbólicos.
- O comando termina com código 1 quando o argumento é recusado, o arquivo não existe ou o YAML não faz parse, sem mexer no arquivo. Caso contrário, termina com código 0.
