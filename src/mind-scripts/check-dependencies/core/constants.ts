/** Lido da raiz do serviço quando o `--config` não aponta outro arquivo. */
export const CONFIG_FILE_NAME = 'dependencyChecks.json';

/** Lido da raiz do serviço quando existe, como o `ConfigModule` do Nest faz no boot; a variável do processo vence. */
export const ENV_FILE_NAME = '.env';

export const CONFIG_OPTION = '--config';

export const USAGE = `Usage: mind-check-dependencies [${CONFIG_OPTION}=<file>]`;

/** Prazo de cada etapa, repassado à biblioteca para o socket não ficar aberto depois. */
export const CHECK_TIMEOUT_MILLISECONDS = 10_000;

/**
 * Prazo geral de cada verificação, para o que a biblioteca não limita, como um servidor que aceita a conexão e não
 * responde. Fica acima da soma dos prazos da biblioteca na verificação mais longa, a conexão e os dois comandos do
 * Mongo e do Redis, para o erro dela, mais preciso, chegar primeiro.
 */
export const CHECK_DEADLINE_MILLISECONDS = 3 * CHECK_TIMEOUT_MILLISECONDS + 5_000;

/** Só age se algum socket ficar aberto depois do relatório, como o de uma verificação que estourou o prazo. */
export const FORCED_EXIT_GRACE_MILLISECONDS = 2_000;
