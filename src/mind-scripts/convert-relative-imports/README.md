# Conversão de imports relativos

Troca pelo alias do `tsconfig.json` os imports relativos dos arquivos `.ts` de `src/` que algum alias cobre, para que o código importe cada módulo sempre pelo mesmo caminho.

```ts
import { BotService } from '../bot/bot.service';
```

vira, com `"@bot/*": ["src/bot/*"]` em `compilerOptions.paths`,

```ts
import { BotService } from '@bot/bot.service';
```

## Como usar

O pacote instala o comando `mind-convert-relative-imports`, que lê o `tsconfig.json` do diretório em que roda e percorre o `src/` dele. No `package.json` do serviço:

```json
"scripts": {
  "convert-relative-imports": "mind-convert-relative-imports"
}
```

Rodado pelo `yarn`, o diretório é a raiz do serviço. O comando também pode entrar no `lint-staged`, antes do lint e do prettier. Ele percorre o `src/` inteiro e não só os arquivos em staged, então os arquivos convertidos fora do staged precisam de um `git add` próprio. Depois de rodar, revise as mudanças com `git diff`.

## Pré-requisito

O `tsc` não reescreve os `paths` no JavaScript que gera, então o serviço precisa resolver os aliases por conta própria antes de adotar o comando; sem isso o build passa, mas a aplicação falha ao subir e os testes falham, ambos com `Cannot find module '@...'`. Na execução, o `tsconfig-paths` registrado com o `baseUrl` apontado para a saída do build resolve os aliases, assim como o `tsc-alias` rodado depois do `tsc`; no Jest, o `moduleNameMapper` gerado dos mesmos `paths`, com o `prefix` levando do `rootDir` do Jest ao `baseUrl`, faz o mesmo:

```json
"start": "NODE_OPTIONS=\"-r tsconfig-paths/register\" TS_NODE_BASEURL=./dist nest start"
```

```ts
import { pathsToModuleNameMapper } from 'ts-jest';

moduleNameMapper: pathsToModuleNameMapper(compilerOptions.paths ?? {}, { prefix: '<rootDir>/' }),
```

## Comportamento

- Os aliases são os de pasta, terminados em `/*`, com o primeiro destino de cada um, em `dir/*` ou `*`, que é a própria base, a partir do `baseUrl` ou, sem ele, da pasta do `tsconfig.json`. Um alias exato, que aponta um único arquivo, não entra.
- Quando mais de um alias cobre o caminho, vale o de destino mais específico: com `@app/*` em `src/*` e `@bot/*` em `src/bot/*`, um import de `src/bot/` vira `@bot/`. O import da própria pasta de um alias, como `'../bot'`, vira o alias mais genérico, `@app/bot`.
- São convertidos o caminho depois de `from`, em `import` e em `export`, e o `import` só de efeito, como `import './setup'`. Ficam como estão o `import()` dinâmico, o `require` e o caminho que nenhum alias cobre.
- A troca é feita pelo texto, então um `from './x'` dentro de string ou de comentário também é trocado.
- O `tsconfig.json` precisa ser JSON puro e ter os `paths` nele mesmo: comentários e os `paths` herdados por `extends` não são lidos.
- Sem alias de pasta no `tsconfig.json`, o comando não converte nada e termina com código 1. O arquivo que falha na leitura ou na escrita é relatado sem interromper os demais e também faz o comando terminar com código 1.
