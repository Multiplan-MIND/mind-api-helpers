#!/usr/bin/env node
/**
 * Alvo do comando `mind-convert-relative-imports` no `bin`. Fica na raiz, e não no `dist/`, porque o yarn cria os links
 * dos comandos antes de o `postinstall` compilar o `dist/`.
 */
require('./dist/mind-scripts/convert-relative-imports/convert-relative-imports-command');
