#!/usr/bin/env node
/**
 * Alvo do comando `mind-check-coverage` no `bin`. Fica em `bin/`, e não no `dist/`, porque o yarn cria os links dos
 * comandos antes de o `postinstall` compilar o `dist/`.
 */
require('../dist/mind-scripts/check-coverage/check-coverage-command');
