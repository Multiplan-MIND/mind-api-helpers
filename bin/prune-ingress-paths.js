#!/usr/bin/env node
/**
 * Alvo do comando `mind-prune-ingress-paths` no `bin`. Fica em `bin/`, e não no `dist/`, porque o yarn cria os links dos
 * comandos antes de o `postinstall` compilar o `dist/`.
 */
require('../dist/mind-scripts/prune-ingress-paths/prune-ingress-paths-command');
