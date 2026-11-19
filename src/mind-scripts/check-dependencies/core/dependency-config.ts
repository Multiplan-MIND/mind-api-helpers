import { readFileSync } from 'node:fs';

import { DependencyDefinition } from './dependency-definition';
import { isPlainObject } from './fields';

export interface DependencyEntry {
  dependency: string;
  definition: DependencyDefinition;
  /** Modelo resolvido antes dos demais campos; vazio ou `false` dispensa a verificação. */
  enabled?: string;
  /** Os campos como estão no arquivo, já conferidos contra o formato do tipo. */
  fields: Record<string, unknown>;
}

function parseEntry(
  dependency: string,
  value: unknown,
  filePath: string,
  definitions: Record<string, DependencyDefinition>,
): DependencyEntry {
  const location = `"${dependency}" in ${filePath}`;
  if (!isPlainObject(value)) throw new Error(`${location} must be an object`);

  const { type, enabled, ...fields } = value;
  const types = Object.keys(definitions);
  if (typeof type !== 'string' || !types.includes(type)) {
    throw new Error(`type of ${location} must be one of ${types.join(', ')}`);
  }
  if (enabled !== undefined && typeof enabled !== 'string') throw new Error(`enabled of ${location} must be a string`);

  const definition = definitions[type];
  const fieldNames = Object.keys(definition.fields);
  for (const [name, raw] of Object.entries(fields)) {
    if (!fieldNames.includes(name)) throw new Error(`Unknown key "${name}" in ${location}`);
    const field = definition.fields[name];
    if (!field.accepts(raw)) throw new Error(`${name} of ${location} must be ${field.description}`);
  }

  const missingField = fieldNames.find((name) => definition.fields[name].required && fields[name] === undefined);
  if (missingField) throw new Error(`${location} needs ${missingField}`);

  return { dependency, definition, enabled: typeof enabled === 'string' ? enabled : undefined, fields };
}

/**
 * Lê o arquivo de configuração, na ordem em que as dependências aparecem, e recusa o tipo que `definitions` não
 * registra e a chave ou o valor fora do formato do tipo.
 */
export function readDependencyConfig(
  filePath: string,
  definitions: Record<string, DependencyDefinition>,
): DependencyEntry[] {
  let content: unknown;
  try {
    content = JSON.parse(readFileSync(filePath, 'utf8'));
  } catch (error) {
    throw new Error(`Failed to read ${filePath}: ${(error as Error).message}`);
  }

  if (!isPlainObject(content)) throw new Error(`${filePath} must hold a JSON object`);

  const entries = Object.entries(content).map(([dependency, value]) =>
    parseEntry(dependency, value, filePath, definitions),
  );
  if (entries.length === 0) throw new Error(`${filePath} declares no dependency`);

  return entries;
}
