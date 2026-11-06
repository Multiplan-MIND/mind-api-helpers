import { checkCoverage } from './check-coverage';

/**
 * O comando `mind-check-coverage` resolve os summaries, o `coverageThreshold.json` e o `package.json` a partir do
 * diretório em que roda, que pelo `yarn` é a raiz do serviço.
 */
process.exitCode = checkCoverage(process.argv.slice(2), process.cwd());
