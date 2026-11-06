import './register';

import { writeSync } from 'node:fs';
import { runMain } from 'node:module';
import { resolve } from 'node:path';

const STDERR_FILE_DESCRIPTOR = 2;
const MESSAGE_PREFIX = '[mind-observability]';

/**
 * O comando `mind-observability <script> [argumentos]` equivale a `node -r mind-api-helpers/observability <script>
 * [argumentos]`. O `register` vem no primeiro import, antes de a aplicação carregar qualquer módulo a instrumentar, e a
 * aplicação roda no mesmo processo: sinais, código de saída e memória ficam iguais aos do `-r`, sem um processo pai
 * no meio. O `process.argv` é refeito como o Node o montaria, com o script em caminho absoluto, porque o `runMain`
 * trata um caminho relativo sem `./` como nome de pacote. Ele também escolhe entre CommonJS e ES module como o `node`
 * faria.
 */
const [entry, ...applicationArguments] = process.argv.slice(2);

if (!entry) {
  /** Escrita síncrona: o `process.exit` logo depois descartaria o que o `process.stderr` ainda não tivesse escrito. */
  writeSync(STDERR_FILE_DESCRIPTOR, `${MESSAGE_PREFIX} Usage: mind-observability <script> [arguments...]\n`);
  process.exit(1);
} else {
  process.argv = [process.argv[0], resolve(entry), ...applicationArguments];
  runMain();
}
