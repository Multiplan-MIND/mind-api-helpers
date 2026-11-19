import { checkDependencies } from './check-dependencies';
import { FORCED_EXIT_GRACE_MILLISECONDS } from './core';

/**
 * O comando `mind-check-dependencies` lê o `dependencyChecks.json` e o `.env` do diretório em que roda, que pelo `yarn`
 * é a raiz do serviço. A saída forçada só age se algum socket ficar aberto depois do relatório.
 */
checkDependencies(process.argv.slice(2), process.cwd())
  .then((exitCode) => {
    process.exitCode = exitCode;
  })
  .catch((error: unknown) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => setTimeout(() => process.exit(), FORCED_EXIT_GRACE_MILLISECONDS).unref());
