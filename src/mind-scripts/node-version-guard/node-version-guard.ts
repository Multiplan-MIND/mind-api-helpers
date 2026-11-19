import { existsSync, readFileSync, writeSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { satisfies, validRange } from 'semver';

const STDERR_FILE_DESCRIPTOR = 2;
const PACKAGE_FILE_NAME = 'package.json';
const MESSAGE_PREFIX = '[node-version-guard]';

/**
 * Os pacotes do NestJS 12 são ESM puro, e o `require` deles exige um Node com `require(esm)` sem flag. Numa versão
 * sem esse suporte o processo morre com ERR_REQUIRE_ESM antes de qualquer linha da aplicação, e a mensagem não cita
 * versão nenhuma. O guard roda na importação, antes do que puxa esse ESM, e troca aquele erro por um que nomeia o
 * motivo. Ele aceita só a faixa do `engines.node` do projeto, em que a aplicação e os testes são verificados, e não
 * toda versão com `require(esm)`: uma versão que carrega os pacotes mas nunca foi testada falharia de um jeito que
 * ninguém viu. Sem faixa legível o guard também encerra, porque seguir sem ela desligaria a proteção em silêncio.
 */

/** O package.json mais próximo subindo a partir do diretório atual, como o npm e o yarn localizam o projeto. */
function findNearestPackageFile(startDirectory: string): string | undefined {
  let directory = startDirectory;
  while (!existsSync(join(directory, PACKAGE_FILE_NAME))) {
    const parentDirectory = dirname(directory);
    if (parentDirectory === directory) return undefined;
    directory = parentDirectory;
  }
  return join(directory, PACKAGE_FILE_NAME);
}

function readEnginesNodeRange(packageFile: string): string | undefined {
  try {
    const range = JSON.parse(readFileSync(packageFile, 'utf8'))?.engines?.node;
    return typeof range === 'string' && validRange(range) ? range : undefined;
  } catch {
    return undefined;
  }
}

function describeUnsupportedNodeVersion(): string[] | undefined {
  const packageFile = findNearestPackageFile(process.cwd());
  if (!packageFile) {
    return [`${MESSAGE_PREFIX} No ${PACKAGE_FILE_NAME} found from ${process.cwd()} upwards to read engines.node from.`];
  }

  const range = readEnginesNodeRange(packageFile);
  if (!range) return [`${MESSAGE_PREFIX} ${packageFile} has no valid engines.node range.`];
  if (satisfies(process.version, range)) return undefined;

  return [
    `${MESSAGE_PREFIX} This application requires Node ${range} and is running on ${process.version}.`,
    `Executable: ${process.execPath}`,
    `The range is engines.node in ${packageFile}, the one the application and its tests are verified on.`,
    "The project's Node version is pinned in its .nvmrc and in the base image of its Dockerfile.",
  ];
}

const unsupportedNodeVersionMessage = describeUnsupportedNodeVersion();

if (unsupportedNodeVersionMessage) {
  /** Escrita síncrona: o `process.exit` logo depois descartaria o que o `process.stderr` ainda não tivesse escrito. */
  writeSync(STDERR_FILE_DESCRIPTOR, [...unsupportedNodeVersionMessage, ''].join('\n'));
  process.exit(1);
}
