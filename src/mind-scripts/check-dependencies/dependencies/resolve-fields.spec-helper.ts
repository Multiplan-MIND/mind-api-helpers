/** Resolve os campos de um tipo como o núcleo faz, para o spec de cada tipo conferir padrões, segredos e problemas. */

import { DependencyDefinition, TemplateResolver, resolveSettings } from '../core';

export function resolveFields(
  definition: DependencyDefinition,
  fields: Record<string, unknown>,
  environment: NodeJS.ProcessEnv,
) {
  const resolver = new TemplateResolver(environment);
  const problems: string[] = [];
  const settings = resolveSettings({ dependency: 'dependency', definition, fields }, resolver, problems);

  return {
    settings,
    problems,
    secrets: [...resolver.secrets].sort((first, second) => first.localeCompare(second)),
    missingVariables: [...resolver.missingVariables],
  };
}
