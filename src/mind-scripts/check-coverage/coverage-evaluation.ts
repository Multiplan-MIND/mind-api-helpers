import { COVERAGE_METRICS, CoverageMetric, CoveragePercentages } from './constants';

const METRIC_LABEL_WIDTH = 10;

export function configuredMetrics(thresholds: CoveragePercentages): CoverageMetric[] {
  return COVERAGE_METRICS.filter((metric) => thresholds[metric] !== undefined);
}

function formatPct(pct: number): string {
  return `${pct.toFixed(2)}%`;
}

function report(passed: boolean, message: string): void {
  if (passed) console.log(message);
  else console.error(message);
}

/**
 * Com o baseline abaixo do mínimo, o piso é o próprio baseline, para que a cobertura suba aos poucos sem regredir; com
 * ele no mínimo ou acima, o piso é o mínimo, e o PR pode cair até ele.
 */
function evaluateMetric(metric: CoverageMetric, minimum: number, prPct: number, baselinePct?: number): boolean {
  const label = `${metric.padEnd(METRIC_LABEL_WIDTH)}: PR ${formatPct(prPct)}`;

  if (baselinePct === undefined) {
    const passed = prPct >= minimum;
    report(passed, `${label} | minimum ${formatPct(minimum)} | ${passed ? 'passed' : 'failed: below the minimum'}`);
    return passed;
  }

  const floor = Math.min(baselinePct, minimum);
  const passed = prPct >= floor;
  const delta = prPct - baselinePct;
  const failure = baselinePct < minimum ? 'regression against baseline' : 'below the minimum';

  const comparison = `(${delta >= 0 ? '+' : ''}${formatPct(delta)}) | baseline ${formatPct(baselinePct)}`;
  const result = passed ? 'passed' : `failed: ${failure}`;

  report(passed, `${label} ${comparison} | floor ${formatPct(floor)} | ${result}`);
  return passed;
}

/** Cada métrica configurada é avaliada e relatada, mesmo depois de uma reprovar, para o relatório sair completo. */
export function evaluateCoverage(
  thresholds: CoveragePercentages,
  prPercentages: CoveragePercentages,
  baselinePercentages?: CoveragePercentages,
): boolean {
  if (!baselinePercentages) console.log('Warning: baseline summary not found, checking only the minimums');

  const results = configuredMetrics(thresholds).map((metric) => {
    const baselinePct = baselinePercentages?.[metric];
    if (baselinePercentages && baselinePct === undefined) {
      console.log(`Warning: baseline summary has no ${metric}, checking it only against the minimum`);
    }

    return evaluateMetric(metric, thresholds[metric], prPercentages[metric], baselinePct);
  });

  return results.every(Boolean);
}
