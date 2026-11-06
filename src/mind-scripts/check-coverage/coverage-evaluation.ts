import { MIN_COVERAGE_PCT } from './constants';

function formatPct(pct: number): string {
  return `${pct.toFixed(2)}%`;
}

function evaluateAgainstMinimum(prPct: number): boolean {
  if (prPct < MIN_COVERAGE_PCT) {
    console.error(`Failed: below the minimum (${formatPct(prPct)} < ${MIN_COVERAGE_PCT}%)`);
    return false;
  }

  console.log(`Passed (${formatPct(prPct)} >= ${MIN_COVERAGE_PCT}%)`);
  return true;
}

/**
 * Com o develop abaixo do mínimo, o piso é o próprio develop, para que a cobertura suba aos poucos sem regredir; com
 * ele no mínimo ou acima, o piso é o mínimo, e o PR pode cair até ele.
 */
function evaluateAgainstDevelop(prPct: number, devPct: number): boolean {
  const developReachedMinimum = devPct >= MIN_COVERAGE_PCT;
  const floor = Math.min(devPct, MIN_COVERAGE_PCT);

  if (developReachedMinimum) console.log(`Mode: develop >= ${MIN_COVERAGE_PCT}%, floor fixed at ${MIN_COVERAGE_PCT}%`);
  else console.log(`Mode: develop < ${MIN_COVERAGE_PCT}%, floor = develop (${formatPct(devPct)})`);

  if (prPct < floor) {
    if (developReachedMinimum) {
      console.error(`Failed: coverage fell below ${MIN_COVERAGE_PCT}% (${formatPct(prPct)} < ${MIN_COVERAGE_PCT}%)`);
    } else {
      console.error(`Failed: regression against develop (${formatPct(prPct)} < ${formatPct(devPct)})`);
    }
    return false;
  }

  const delta = prPct - devPct;
  console.log(`Passed (${delta >= 0 ? '+' : ''}${formatPct(delta)} vs develop, floor: ${formatPct(floor)})`);
  return true;
}

export function evaluateCoverage(prPct: number, devPct?: number): boolean {
  console.log(`PR coverage     : ${formatPct(prPct)} (lines)`);

  if (devPct === undefined) {
    console.log('Warning: develop summary not found, checking only the absolute minimum');
    return evaluateAgainstMinimum(prPct);
  }

  console.log(`develop coverage: ${formatPct(devPct)} (lines)`);
  return evaluateAgainstDevelop(prPct, devPct);
}
