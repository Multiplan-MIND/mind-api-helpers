import { existsSync } from 'node:fs';
import { join, resolve } from 'node:path';

import {
  CONFIG_OPTION,
  COVERAGE_METRICS,
  CoverageMetric,
  CoveragePercentages,
  DEFAULT_THRESHOLDS,
  ENFORCE_BEFORE_V1_FLAG,
  THRESHOLD_FILE_NAME,
  USAGE,
} from './constants';
import { readJsonFile } from './read-json-file';

export interface CoverageOptions {
  prSummaryPath: string;
  baselineSummaryPath?: string;
  thresholds: CoveragePercentages;
  enforceBeforeV1: boolean;
}

interface ThresholdSettings {
  thresholds: CoveragePercentages;
  enforceBeforeV1: boolean;
}

interface CommandLine extends ThresholdSettings {
  summaryPaths: string[];
  configPath?: string;
}

function isCoverageMetric(name: string): name is CoverageMetric {
  return (COVERAGE_METRICS as readonly string[]).includes(name);
}

/**
 * O Jest aceita número negativo como máximo de itens descobertos; aqui só percentual, porque é ele que se compara com
 * o baseline.
 */
function parseThreshold(value: unknown, source: string): number {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0 || value > 100) {
    throw new Error(`${source} must be a percentage between 0 and 100`);
  }

  return value;
}

function splitOption(argument: string): [string, string | undefined] {
  const separatorIndex = argument.indexOf('=');
  if (separatorIndex === -1) return [argument, undefined];

  return [argument.slice(0, separatorIndex), argument.slice(separatorIndex + 1)];
}

function applyOption(commandLine: CommandLine, argument: string): void {
  if (argument === ENFORCE_BEFORE_V1_FLAG) {
    commandLine.enforceBeforeV1 = true;
    return;
  }

  const [option, value] = splitOption(argument);
  const metric = option.slice(2);

  if (option === CONFIG_OPTION) {
    if (!value) throw new Error(`${CONFIG_OPTION} needs a file path, as in ${CONFIG_OPTION}=<file>`);
    commandLine.configPath = value;
  } else if (isCoverageMetric(metric) && value !== undefined) {
    commandLine.thresholds[metric] = parseThreshold(value.trim() === '' ? Number.NaN : Number(value), option);
  } else {
    throw new Error(`Unknown option: ${argument}\n${USAGE}`);
  }
}

function parseCommandLine(commandArguments: string[]): CommandLine {
  const commandLine: CommandLine = { summaryPaths: [], thresholds: {}, enforceBeforeV1: false };

  for (const argument of commandArguments) {
    if (argument.startsWith('--')) applyOption(commandLine, argument);
    else commandLine.summaryPaths.push(argument);
  }

  return commandLine;
}

function readThresholdFile(filePath: string): ThresholdSettings {
  const content = readJsonFile(filePath);
  if (typeof content !== 'object' || content === null || Array.isArray(content)) {
    throw new Error(`${filePath} must hold a JSON object`);
  }

  const settings: ThresholdSettings = { thresholds: {}, enforceBeforeV1: false };

  for (const [key, value] of Object.entries(content)) {
    if (isCoverageMetric(key)) {
      settings.thresholds[key] = parseThreshold(value, `${key} in ${filePath}`);
    } else if (key === 'enforceBeforeV1' && typeof value === 'boolean') {
      settings.enforceBeforeV1 = value;
    } else if (key === 'enforceBeforeV1') {
      throw new Error(`enforceBeforeV1 in ${filePath} must be true or false`);
    } else {
      throw new Error(`Unknown key "${key}" in ${filePath}`);
    }
  }

  return settings;
}

/** O `--config` aponta um arquivo que tem de existir; sem ele, o da raiz só é lido quando existe. */
function loadThresholdFile(projectDirectory: string, configPath?: string): ThresholdSettings {
  if (configPath) {
    const filePath = resolve(projectDirectory, configPath);
    if (!existsSync(filePath)) throw new Error(`Threshold file not found: ${filePath}`);

    return readThresholdFile(filePath);
  }

  const defaultFilePath = join(projectDirectory, THRESHOLD_FILE_NAME);

  return existsSync(defaultFilePath) ? readThresholdFile(defaultFilePath) : { thresholds: {}, enforceBeforeV1: false };
}

/**
 * A flag de uma métrica vale sobre o arquivo só para ela. O padrão de 80% de linhas e de branches entra só quando ninguém define
 * mínimo nenhum, para que configurar uma métrica não ligue outra sem querer.
 */
export function resolveCoverageOptions(commandArguments: string[], projectDirectory: string): CoverageOptions {
  const commandLine = parseCommandLine(commandArguments);
  const [prSummaryPath, baselineSummaryPath, ...extraPaths] = commandLine.summaryPaths;
  if (!prSummaryPath || extraPaths.length > 0) throw new Error(USAGE);

  const thresholdFile = loadThresholdFile(projectDirectory, commandLine.configPath);
  const thresholds = { ...thresholdFile.thresholds, ...commandLine.thresholds };

  return {
    prSummaryPath: resolve(projectDirectory, prSummaryPath),
    baselineSummaryPath: baselineSummaryPath && resolve(projectDirectory, baselineSummaryPath),
    thresholds: Object.keys(thresholds).length > 0 ? thresholds : { ...DEFAULT_THRESHOLDS },
    enforceBeforeV1: commandLine.enforceBeforeV1 || thresholdFile.enforceBeforeV1,
  };
}
