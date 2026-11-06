/** As métricas do `total` do `coverage-summary.json` do istanbul, na ordem em que o relatório as mostra. */
export const COVERAGE_METRICS = ['lines', 'statements', 'functions', 'branches'] as const;

export type CoverageMetric = (typeof COVERAGE_METRICS)[number];

/** Percentual por métrica; a métrica ausente não é verificada. */
export type CoveragePercentages = Partial<Record<CoverageMetric, number>>;

/** Aplicado só quando nem o arquivo nem a linha de comando definem mínimo para métrica nenhuma. */
export const DEFAULT_THRESHOLDS: CoveragePercentages = { lines: 80, branches: 80 };

/** Lido da raiz do serviço quando existe e o `--config` não aponta outro arquivo. */
export const THRESHOLD_FILE_NAME = 'coverageThreshold.json';

/** Versão maior a partir da qual o gate reprova por padrão; abaixo dela o resultado é só informativo. */
export const ENFORCED_MAJOR_VERSION = 1;

export const ENFORCE_BEFORE_V1_FLAG = '--enforce-before-v1';

export const CONFIG_OPTION = '--config';

export const USAGE = [
  `Usage: mind-check-coverage [${ENFORCE_BEFORE_V1_FLAG}] [${CONFIG_OPTION}=<file>]`,
  ...COVERAGE_METRICS.map((metric) => `[--${metric}=<pct>]`),
  '<pr-summary.json> [baseline-summary.json]',
].join(' ');

export const SEPARATOR = '══════════════════════════════════════════';
