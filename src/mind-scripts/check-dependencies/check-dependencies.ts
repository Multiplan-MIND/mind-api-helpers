import { existsSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { parseEnv } from 'node:util';

import { MindLoggerService } from '../../mind-logger/mind-logger.service';
import { logPrefix } from '../../mind-logger/mind-logger.util';
import {
  CHECK_DEADLINE_MILLISECONDS,
  CONFIG_FILE_NAME,
  CONFIG_OPTION,
  DependencyCheck,
  ENV_FILE_NAME,
  TemplateResolver,
  USAGE,
  buildDependencyChecks,
  maskSecrets,
  readDependencyConfig,
} from './core';
import { DEPENDENCY_TYPES } from './dependencies';

type CheckResult =
  | { dependency: string; outcome: 'success'; durationMs: number }
  | { dependency: string; outcome: 'failure'; durationMs: number; error: unknown }
  | { dependency: string; outcome: 'skipped'; reason: string };

/**
 * O logger da helpers, e não o console, porque em produção as linhas são lidas por consultas que esperam o formato dos
 * serviços MIND.
 */
function createLogger(): MindLoggerService {
  const logger = new MindLoggerService();
  logger.setModule('DependencyCheck');

  return logger;
}

function resolveConfigPath(commandArguments: string[], workingDirectory: string): string {
  const [argument, ...extraArguments] = commandArguments;
  if (extraArguments.length > 0) throw new Error(USAGE);
  if (argument === undefined) return join(workingDirectory, CONFIG_FILE_NAME);

  const prefix = `${CONFIG_OPTION}=`;
  if (!argument.startsWith(prefix) || argument === prefix) throw new Error(`Unknown option: ${argument}\n${USAGE}`);

  return resolve(workingDirectory, argument.slice(prefix.length));
}

/** O `.env` só completa: a variável que o processo já tem vence, como no `ConfigModule` do Nest. */
function loadEnvironment(workingDirectory: string, environment: NodeJS.ProcessEnv): NodeJS.ProcessEnv {
  const envFilePath = join(workingDirectory, ENV_FILE_NAME);
  if (!existsSync(envFilePath)) return environment;

  return { ...parseEnv(readFileSync(envFilePath, 'utf8')), ...environment };
}

async function runWithinDeadline(run: () => Promise<void>): Promise<void> {
  let timer: NodeJS.Timeout | undefined;
  const deadline = new Promise<never>((_resolve, reject) => {
    timer = setTimeout(
      () => reject(new Error(`Did not finish within ${CHECK_DEADLINE_MILLISECONDS}ms`)),
      CHECK_DEADLINE_MILLISECONDS,
    );
  });
  try {
    await Promise.race([run(), deadline]);
  } finally {
    clearTimeout(timer);
  }
}

async function runCheck(check: DependencyCheck): Promise<CheckResult> {
  if ('skipReason' in check) return { dependency: check.dependency, outcome: 'skipped', reason: check.skipReason };

  const startedAt = Date.now();
  /** O desfecho é decidido pelo caminho da promessa, e não pelo valor rejeitado, que pode ser falso. */
  return runWithinDeadline(check.run).then(
    (): CheckResult => ({ dependency: check.dependency, outcome: 'success', durationMs: Date.now() - startedAt }),
    (error: unknown): CheckResult => ({
      dependency: check.dependency,
      outcome: 'failure',
      durationMs: Date.now() - startedAt,
      error,
    }),
  );
}

/**
 * A mensagem passa pela máscara, porque a biblioteca pode citar a URI ou o cabeçalho no erro. Os frames da pilha ficam
 * de fora quando a pilha começa pela mensagem: um segredo curto, como o usuário `mind`, apagaria os caminhos dos
 * arquivos. O erro original não chega ao log, porque o logger serializaria os campos dele sem máscara.
 */
function maskError(error: unknown, secrets: Set<string>): Error {
  const original = error instanceof Error ? error : new Error(String(error));
  const masked = new Error(maskSecrets(original.message, secrets));
  const header = `${original.name}: ${original.message}`;
  const stack = original.stack ?? header;
  masked.stack = stack.startsWith(header)
    ? `${original.name}: ${masked.message}${stack.slice(header.length)}`
    : maskSecrets(stack, secrets);

  return masked;
}

function reportCheck(logger: MindLoggerService, result: CheckResult, secrets: Set<string>): void {
  const detail = result.outcome === 'skipped' ? `reason=${result.reason}` : `durationMs=${result.durationMs}`;
  const line = `Dependency check finished | dependency=${result.dependency} outcome=${result.outcome} ${detail}`;
  if (result.outcome === 'failure') logger.error(line, logPrefix('reportCheck'), maskError(result.error, secrets));
  else logger.info(line, logPrefix('reportCheck'));
}

/**
 * Lê o arquivo e resolve as variáveis de todas as dependências habilitadas antes de testar qualquer uma, para que uma
 * configuração incompleta saia inteira numa linha só, como a etapa `environment`, e nada mais rode.
 */
function prepareChecks(
  commandArguments: string[],
  workingDirectory: string,
  environment: NodeJS.ProcessEnv,
): { checks: DependencyCheck[]; secrets: Set<string>; problems: string[] } {
  const entries = readDependencyConfig(resolveConfigPath(commandArguments, workingDirectory), DEPENDENCY_TYPES);
  const resolver = new TemplateResolver(loadEnvironment(workingDirectory, environment));
  const { checks, problems } = buildDependencyChecks(entries, resolver);
  if (resolver.missingVariables.size > 0) {
    problems.unshift(`Missing environment variables: ${[...resolver.missingVariables].join(', ')}`);
  }

  return { checks, secrets: resolver.secrets, problems };
}

async function runDependencyChecks(
  logger: MindLoggerService,
  commandArguments: string[],
  workingDirectory: string,
  environment: NodeJS.ProcessEnv,
): Promise<number> {
  const startedAt = Date.now();
  const { checks, secrets, problems } = prepareChecks(commandArguments, workingDirectory, environment);
  const durationMs = Date.now() - startedAt;
  const environmentResult: CheckResult =
    problems.length > 0
      ? { dependency: 'environment', outcome: 'failure', durationMs, error: new Error(problems.join('; ')) }
      : { dependency: 'environment', outcome: 'success', durationMs };
  reportCheck(logger, environmentResult, secrets);
  if (environmentResult.outcome === 'failure') return 1;

  const results = await Promise.all(checks.map(runCheck));
  for (const result of results) reportCheck(logger, result, secrets);

  const count = (outcome: CheckResult['outcome']): number =>
    results.filter((result) => result.outcome === outcome).length;
  const [successCount, failureCount, skippedCount] = [count('success'), count('failure'), count('skipped')];
  const summary = `Dependency check summary | success=${successCount} failure=${failureCount} skipped=${skippedCount}`;
  if (failureCount > 0) logger.error(summary, logPrefix('main'));
  else logger.info(summary, logPrefix('main'));

  return failureCount > 0 ? 1 : 0;
}

/**
 * Testa se o serviço alcança cada dependência declarada no `dependencyChecks.json`, usando a configuração do ambiente
 * em que roda e sem subir a aplicação. Todas rodam mesmo depois de uma falha, para uma execução mostrar
 * todos os problemas, e o código de saída é 1 se qualquer uma falhar.
 */
export async function checkDependencies(
  commandArguments: string[],
  workingDirectory: string,
  environment: NodeJS.ProcessEnv = process.env,
): Promise<number> {
  const logger = createLogger();
  try {
    return await runDependencyChecks(logger, commandArguments, workingDirectory, environment);
  } catch (error) {
    logger.error('Dependency check crashed', logPrefix('checkDependencies'), error);
    return 1;
  }
}
