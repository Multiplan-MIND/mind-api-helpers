import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { major, valid } from 'semver';

import { ENFORCE_BEFORE_V1_FLAG, ENFORCED_MAJOR_VERSION, SEPARATOR, USAGE } from './constants';
import { evaluateCoverage } from './coverage-evaluation';

interface CoverageArguments {
  prSummaryPath: string;
  developSummaryPath?: string;
  enforceBeforeV1: boolean;
}

function parseArguments(commandArguments: string[]): CoverageArguments | undefined {
  const enforceBeforeV1 = commandArguments.includes(ENFORCE_BEFORE_V1_FLAG);
  const [prSummaryPath, developSummaryPath] = commandArguments.filter(
    (argument) => argument !== ENFORCE_BEFORE_V1_FLAG,
  );

  return prSummaryPath ? { prSummaryPath, developSummaryPath, enforceBeforeV1 } : undefined;
}

/**
 * O istanbul grava `"Unknown"` no `pct` quando não há arquivo nenhum coberto. Comparado com o piso, um valor que não é
 * número nunca fica abaixo dele e aprovaria o PR, então o summary sem número é recusado.
 */
function readLinesPct(summaryPath: string): number {
  const pct = JSON.parse(readFileSync(summaryPath, 'utf8'))?.total?.lines?.pct;
  if (typeof pct !== 'number') throw new Error(`${summaryPath} has no numeric total.lines.pct`);

  return pct;
}

function readProjectVersion(projectDirectory: string): string | undefined {
  try {
    const version = JSON.parse(readFileSync(join(projectDirectory, 'package.json'), 'utf8'))?.version;
    return typeof version === 'string' ? valid(version) ?? undefined : undefined;
  } catch {
    return undefined;
  }
}

/** Sem versão legível no `package.json` o gate vale, para que um projeto mal configurado não passe sem cobrança. */
function isGateEnforced(projectDirectory: string, enforceBeforeV1: boolean): boolean {
  if (enforceBeforeV1) return true;

  const version = readProjectVersion(projectDirectory);
  if (version === undefined || major(version) >= ENFORCED_MAJOR_VERSION) return true;

  console.log(
    `Warning: version ${version} is below ${ENFORCED_MAJOR_VERSION}.0, the result is informational only (use ${ENFORCE_BEFORE_V1_FLAG} to fail the build)`,
  );
  return false;
}

/**
 * Compara a cobertura de linhas do PR com a do develop, pelos `coverage-summary.json` do istanbul, e devolve o código
 * de saída do comando. O summary do develop é opcional porque a pipeline o baixa e ele pode ainda não existir.
 */
export function checkCoverage(commandArguments: string[], projectDirectory: string): number {
  const coverageArguments = parseArguments(commandArguments);
  if (!coverageArguments) {
    console.error(USAGE);
    return 1;
  }

  const { prSummaryPath, developSummaryPath, enforceBeforeV1 } = coverageArguments;
  if (!existsSync(prSummaryPath)) {
    console.error(`File not found: ${prSummaryPath}`);
    return 1;
  }

  try {
    const prPct = readLinesPct(prSummaryPath);
    const devPct = developSummaryPath && existsSync(developSummaryPath) ? readLinesPct(developSummaryPath) : undefined;

    console.log(`\n${SEPARATOR}\n       Test coverage check\n${SEPARATOR}\n`);
    const approved = evaluateCoverage(prPct, devPct);
    const enforced = isGateEnforced(projectDirectory, enforceBeforeV1);
    console.log(`\n${SEPARATOR}\n`);

    return approved || !enforced ? 0 : 1;
  } catch (error) {
    console.error(`Failed to read the coverage summary: ${(error as Error).message}`);
    return 1;
  }
}
