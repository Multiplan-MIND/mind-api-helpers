import { checkCoverage } from './check-coverage';

/**
 * O comando `mind-check-coverage` lê a versão no `package.json` do diretório em que roda, que pelo `yarn` é a raiz do
 * serviço; os caminhos dos summaries também são relativos a ele.
 */
process.exitCode = checkCoverage(process.argv.slice(2), process.cwd());
