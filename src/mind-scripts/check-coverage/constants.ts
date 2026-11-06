/** Cobertura de linhas mínima, exigida quando não há summary do develop ou quando o develop já está nela. */
export const MIN_COVERAGE_PCT = 90;

/** Versão maior a partir da qual o gate reprova por padrão; abaixo dela o resultado é só informativo. */
export const ENFORCED_MAJOR_VERSION = 1;

export const ENFORCE_BEFORE_V1_FLAG = '--enforce-before-v1';

export const USAGE = `Usage: mind-check-coverage [${ENFORCE_BEFORE_V1_FLAG}] <pr-summary.json> [develop-summary.json]`;

export const SEPARATOR = '══════════════════════════════════════════';
