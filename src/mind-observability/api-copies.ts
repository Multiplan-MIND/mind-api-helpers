import { existsSync, readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';

const API_PACKAGE = '@opentelemetry/api';

/** Pacotes que costumam trazer a própria cópia da API ao lado do serviço. */
const API_CONSUMERS = ['ai'];

/**
 * O SDK se registra num global que só cópias da API de mesma minor ou mais antigas aceitam. Uma cópia mais nova ao lado
 * do serviço (a que o `ai` traz, por exemplo) recebe uma implementação vazia, e os spans e as métricas dela somem sem
 * erro. Devolve as versões das cópias mais novas alcançáveis da raiz do serviço e dos pacotes conhecidos, para a
 * partida avisar.
 */
export function findNewerApiCopies(cwd = process.cwd(), ownFile = __filename): string[] {
  const own = apiVersionFrom(ownFile);
  if (!own) {
    return [];
  }
  const serviceRoot = join(cwd, 'package.json');
  const origins = [serviceRoot, ...API_CONSUMERS.map((name) => resolveFrom(serviceRoot, name)).filter(Boolean)];
  const versions = origins.map(apiVersionFrom).filter((version) => version && isNewerMinor(version, own));
  return [...new Set(versions)];
}

export function warnAboutNewerApiCopies(cwd = process.cwd()): void {
  for (const version of findNewerApiCopies(cwd)) {
    process.stderr.write(
      `[mind-observability] ${API_PACKAGE} ${version} next to the service is newer than the copy used by ` +
        `mind-api-helpers; telemetry created through it is dropped. Align them with a yarn resolution.\n`,
    );
  }
}

function apiVersionFrom(fromFile: string): string | undefined {
  const entry = resolveFrom(fromFile, API_PACKAGE);
  return entry ? packageVersionAbove(entry, API_PACKAGE) : undefined;
}

function resolveFrom(fromFile: string, request: string): string | undefined {
  try {
    return createRequire(fromFile).resolve(request);
  } catch {
    return undefined;
  }
}

/** Sobe de um arquivo resolvido até o `package.json` de `name`; a API não exporta o próprio `package.json`. */
function packageVersionAbove(file: string, name: string): string | undefined {
  for (let dir = dirname(file); dir !== dirname(dir); dir = dirname(dir)) {
    const manifest = readManifest(join(dir, 'package.json'));
    if (isManifestOf(manifest, name)) {
      return manifest.version;
    }
  }
  return undefined;
}

function readManifest(path: string): unknown {
  try {
    return existsSync(path) ? JSON.parse(readFileSync(path, 'utf8')) : undefined;
  } catch {
    return undefined;
  }
}

function isManifestOf(value: unknown, name: string): value is { name: string; version: string } {
  return (
    typeof value === 'object' &&
    value !== null &&
    'name' in value &&
    value.name === name &&
    'version' in value &&
    typeof value.version === 'string'
  );
}

function isNewerMinor(version: string, own: string): boolean {
  const [major, minor] = version.split('.').map(Number);
  const [ownMajor, ownMinor] = own.split('.').map(Number);
  return major === ownMajor && minor > ownMinor;
}
