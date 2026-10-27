import { existsSync, readFileSync } from 'fs';
import * as util from 'util';

const TRACING_PREFIXES = ['OTEL_', 'MIND_TRACING_'];

type ParseEnv = (content: string) => Record<string, string>;

/**
 * Copies the tracing variables (`OTEL_*` and `MIND_TRACING_*`) from the `.env` file in the working directory into
 * `env`, without overriding values already set. `register` runs before the service reads its `.env`, so variables
 * kept only in that file would otherwise arrive too late and tracing would stay off. Only the tracing variables are
 * copied, so the rest of the service configuration is still read the way the service already reads it.
 *
 * Silently does nothing without the file or on a Node version without `util.parseEnv` (< 20.12).
 */
export function loadTracingEnvFile(path = '.env', env: NodeJS.ProcessEnv = process.env): void {
  const parseEnv = (util as unknown as { parseEnv?: ParseEnv }).parseEnv;
  if (!parseEnv || !existsSync(path)) {
    return;
  }
  try {
    const parsed = parseEnv(readFileSync(path, 'utf8'));
    for (const [key, value] of Object.entries(parsed)) {
      if (TRACING_PREFIXES.some((prefix) => key.startsWith(prefix)) && env[key] === undefined) {
        env[key] = value;
      }
    }
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    process.stderr.write(`[mind-tracing] failed to read ${path}, continuing without it: ${message}\n`);
  }
}
