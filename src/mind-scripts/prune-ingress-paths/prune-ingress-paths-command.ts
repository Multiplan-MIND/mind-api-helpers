import { pruneIngressPaths } from './prune-ingress-paths';

/**
 * O comando `mind-prune-ingress-paths` só aceita o arquivo de ingress dentro do diretório em que roda, que pelo `yarn`
 * é a raiz do serviço, onde a pipeline baixa o arquivo.
 */
process.exitCode = pruneIngressPaths(process.argv.slice(2), process.cwd());
