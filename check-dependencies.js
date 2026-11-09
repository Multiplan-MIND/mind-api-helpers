#!/usr/bin/env node
/**
 * Alvo do comando `mind-check-dependencies` no `bin`. Fica na raiz, e não no `dist/`, porque o yarn cria os links dos
 * comandos antes de o `postinstall` compilar o `dist/`.
 */
require('./dist/mind-scripts/check-dependencies/check-dependencies-command');
