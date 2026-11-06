# Conversão de comentários

Converte em bloco `/** */` os comentários `//` que ocupam a linha inteira nos arquivos `.ts`, `.tsx`, `.js` e `.jsx` do serviço, para manter um só delimitador de comentário no projeto. Linhas consecutivas de mesma indentação viram um só bloco, e um `//` vazio entre elas separa parágrafos dentro do bloco.

```ts
// Explica o porquê
// em duas linhas.
const value = 1; // comentário depois de código fica como está
```

vira

```ts
/**
 * Explica o porquê
 * em duas linhas.
 */
const value = 1; // comentário depois de código fica como está
```

## Como usar

O pacote instala o comando `mind-fix-comments`, que percorre o diretório em que roda. No `package.json` do serviço:

```json
"scripts": {
  "fix-comments": "mind-fix-comments"
}
```

Rodado pelo `yarn`, o diretório é a raiz do serviço. O comando também pode entrar no `lint-staged`, antes do lint e do prettier. Ele percorre o projeto inteiro e não só os arquivos em staged, então os arquivos convertidos fora do staged precisam de um `git add` próprio. Depois de rodar, revise as mudanças com `git diff`.

## Comportamento

- Ficam como estão, porque a conversão os quebraria:
  - as diretivas de ferramenta (`eslint-`, `@ts-`, `prettier-ignore`, `istanbul ignore`, `c8 ignore`, `v8 ignore`, `webpack`, o `///` do TypeScript e o `//#` de source map e de região), que só funcionam como `//`;
  - o comentário que contém `*/`, que fecharia o bloco gerado antes da hora;
  - o comentário que vem depois de código na mesma linha;
  - a linha que começa dentro de um bloco `/* */` aberto antes ou de uma template string, em que o `//` não é comentário.
- Um `//` vazio no fim da sequência de comentários também fica como está.
- Ficam de fora dependências, builds, cobertura, logs, documentação, configuração de editor e de Storybook, Terraform e Cypress. A lista completa está em [`constants.ts`](constants.ts).
- Cada arquivo convertido é relatado com uma amostra das linhas alteradas. O arquivo que falha na leitura ou na escrita é relatado sem interromper os demais e faz o comando terminar com código 1.
