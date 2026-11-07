import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { major, valid } from 'semver';

import {
  CoverageMetric,
  CoveragePercentages,
  ENFORCE_BEFORE_V1_FLAG,
  ENFORCED_MAJOR_VERSION,
  SEPARATOR,
} from './constants';
import { configuredMetrics, evaluateCoverage } from './coverage-evaluation';
import { CoverageOptions, resolveCoverageOptions } from './coverage-options';
import { readJsonFile } from './read-json-file';

interface CoverageSummary {
  total?: Partial<Record<CoverageMetric, { pct?: unknown }>>;
}

/** Só as métricas com percentual numérico; o istanbul grava `"Unknown"` quando não há arquivo nenhum coberto. */
function readNumericPercentages(summaryPath: string, metrics: CoverageMetric[]): CoveragePercentages {
  const total = (readJsonFile(summaryPath) as CoverageSummary)?.total;
  const percentages: CoveragePercentages = {};

  for (const metric of metrics) {
    const pct = total?.[metric]?.pct;
    if (typeof pct === 'number') percentages[metric] = pct;
  }

  return percentages;
}

/**
 * No PR, a métrica sem número é recusada: comparado com o piso, um valor que não é número nunca fica abaixo dele e
 * aprovaria o PR. No baseline ela só deixa de ser comparada, como quando o baseline inteiro falta.
 */
function readPrPercentages(summaryPath: string, metrics: CoverageMetric[]): CoveragePercentages {
  const percentages = readNumericPercentages(summaryPath, metrics);
  const missingMetric = metrics.find((metric) => percentages[metric] === undefined);
  if (missingMetric) throw new Error(`${summaryPath} has no numeric total.${missingMetric}.pct`);

  return percentages;
}

function readProjectVersion(projectDirectory: string): string | undefined {
  try {
    const version = (readJsonFile(join(projectDirectory, 'package.json')) as { version?: unknown })?.version;
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

/** O summary do baseline é opcional porque a pipeline o baixa e ele pode ainda não existir. */
function runCoverageGate(options: CoverageOptions, projectDirectory: string): number {
  const { prSummaryPath, baselineSummaryPath, thresholds, enforceBeforeV1 } = options;
  if (!existsSync(prSummaryPath)) throw new Error(`File not found: ${prSummaryPath}`);

  const metrics = configuredMetrics(thresholds);
  const prPercentages = readPrPercentages(prSummaryPath, metrics);
  const baselinePercentages =
    baselineSummaryPath && existsSync(baselineSummaryPath)
      ? readNumericPercentages(baselineSummaryPath, metrics)
      : undefined;

  console.log(`\n${SEPARATOR}\n       Test coverage check\n${SEPARATOR}\n`);
  const approved = evaluateCoverage(thresholds, prPercentages, baselinePercentages);
  const enforced = isGateEnforced(projectDirectory, enforceBeforeV1);
  console.log(`\n${SEPARATOR}\n`);

  return approved || !enforced ? 0 : 1;
}

/**
 * Compara a cobertura do PR com a do baseline, pelos `coverage-summary.json` do istanbul, nas métricas que têm mínimo
 * configurado, e devolve o código de saída do comando.
 */
export function checkCoverage(commandArguments: string[], projectDirectory: string): number {
  try {
    return runCoverageGate(resolveCoverageOptions(commandArguments, projectDirectory), projectDirectory);
  } catch (error) {
    console.error((error as Error).message);
    return 1;
  }
}
