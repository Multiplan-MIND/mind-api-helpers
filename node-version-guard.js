#!/usr/bin/env node
/**
 * Atalho para `import 'mind-api-helpers/node-version-guard'`, `node -r` e o comando `mind-node-guard`, sem expor o
 * caminho do `dist/`. O `bin` aponta para este arquivo, e não para o `dist/`, porque o yarn cria os links dos comandos
 * antes de o `postinstall` compilar o `dist/`.
 */
require('./dist/mind-scripts/node-version-guard/node-version-guard');
