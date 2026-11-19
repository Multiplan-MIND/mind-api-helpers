#!/usr/bin/env node
/**
 * Atalho para `node -r mind-api-helpers/observability` e o comando `mind-observability`, sem expor o caminho do
 * `dist/`. Pelo `-r` o arquivo não é o módulo principal e só carrega o `register`; pelo comando ele é, e carrega o
 * `observability-command`, que inicia o `register` e depois a aplicação. O `bin` aponta para este arquivo, e não para
 * o `dist/`, porque o yarn cria os links dos comandos antes de o `postinstall` compilar o `dist/`.
 */
if (require.main === module) require('./dist/mind-observability/observability-command');
else require('./dist/mind-observability/register');
