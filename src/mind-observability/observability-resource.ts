import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { getResourceDetectors } from '@opentelemetry/auto-instrumentations-node';
import { containerDetector } from '@opentelemetry/resource-detector-container';
import {
  defaultResource,
  envDetector,
  hostDetector,
  osDetector,
  processDetector,
  Resource,
  ResourceDetector,
  resourceFromAttributes,
  serviceInstanceIdDetector,
} from '@opentelemetry/resources';

/** Atributos da linha de comando ficam de fora: um token passado por argumento seria exportado em todo lote. */
const PROCESS_ATTRIBUTES_LEFT_OUT = ['process.command_args', 'process.command_line'];

const processDetectorWithoutArguments: ResourceDetector = {
  detect: (config) => {
    const { attributes = {} } = processDetector.detect(config);
    return {
      attributes: Object.fromEntries(
        Object.entries(attributes).filter(([key]) => !PROCESS_ATTRIBUTES_LEFT_OUT.includes(key)),
      ),
    };
  },
};

interface ServicePackage {
  name?: unknown;
  version?: unknown;
}

/**
 * Detectores de recurso. `OTEL_NODE_RESOURCE_DETECTORS` usa a lista oficial (`container`, `aws`, `process`...); sem
 * ela, contêiner, host, sistema operacional, processo sem os argumentos e `service.instance.id`, que separa as
 * réplicas. O `env` vem por último para `OTEL_SERVICE_NAME` e `OTEL_RESOURCE_ATTRIBUTES` vencerem o que é detectado.
 */
export function createResourceDetectors(env: NodeJS.ProcessEnv): ResourceDetector[] {
  if (env.OTEL_NODE_RESOURCE_DETECTORS) {
    return getResourceDetectors();
  }
  return [
    containerDetector,
    hostDetector,
    osDetector,
    processDetectorWithoutArguments,
    serviceInstanceIdDetector,
    envDetector,
  ];
}

/**
 * Recurso base: `service.name` e `service.version` do `package.json` do diretório de trabalho, para um serviço sem
 * `OTEL_SERVICE_NAME` não aparecer como `unknown_service:node`. O recurso detectado é mesclado por cima.
 */
export function createDefaultResource(cwd = process.cwd()): Resource {
  const servicePackage = readServicePackage(cwd);
  const attributes: Record<string, string> = {};
  if (typeof servicePackage?.name === 'string' && servicePackage.name) {
    attributes['service.name'] = servicePackage.name;
  }
  if (typeof servicePackage?.version === 'string' && servicePackage.version) {
    attributes['service.version'] = servicePackage.version;
  }
  return defaultResource().merge(resourceFromAttributes(attributes));
}

function readServicePackage(cwd: string): ServicePackage | undefined {
  try {
    const parsed: unknown = JSON.parse(readFileSync(join(cwd, 'package.json'), 'utf8'));
    return isServicePackage(parsed) ? parsed : undefined;
  } catch {
    return undefined;
  }
}

function isServicePackage(value: unknown): value is ServicePackage {
  return typeof value === 'object' && value !== null;
}
