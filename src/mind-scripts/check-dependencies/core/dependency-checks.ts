import { DependencyEntry } from './dependency-config';
import { FieldSpecs, SettingsOf } from './dependency-definition';
import { TemplateResolver } from './template-resolver';

/** Uma dependência dispensada não é testada e aparece no relatório com o motivo. */
export type DependencyCheck =
  | { dependency: string; run: () => Promise<void> }
  | { dependency: string; skipReason: string };

/** A variável vazia ou `false` dispensa, como o `TELEMETRY_ENABLED` desligado ou a URL que o ambiente não define. */
const DISABLED_VALUES = new Set(['', 'false']);

/**
 * Resolve cada campo do tipo, na ordem em que o tipo os declara, com o padrão do campo quando o arquivo não o define.
 * Os segredos ficam no resolvedor e os valores fora do formato em `problems`.
 */
export function resolveSettings(
  entry: DependencyEntry,
  resolver: TemplateResolver,
  problems: string[],
): SettingsOf<FieldSpecs> {
  const invalid = (name: string) => (reason: string) => problems.push(`${name} of "${entry.dependency}" ${reason}`);

  return Object.fromEntries(
    Object.entries(entry.definition.fields).map(([name, field]) => [
      name,
      field.resolve(entry.fields[name], { resolver, invalid: invalid(name) }),
    ]),
  );
}

/**
 * Resolve as variáveis de cada dependência habilitada. A dispensada não tem os demais campos resolvidos, para a
 * variável que só ela usa não ser cobrada. Os problemas de valor voltam junto, para o relatório mostrar todos de uma
 * vez com as variáveis ausentes.
 */
export function buildDependencyChecks(
  entries: DependencyEntry[],
  resolver: TemplateResolver,
): { checks: DependencyCheck[]; problems: string[] } {
  const problems: string[] = [];
  const checks = entries.map((entry): DependencyCheck => {
    const enabled = entry.enabled === undefined ? 'true' : resolver.resolve(entry.enabled).trim().toLowerCase();
    if (DISABLED_VALUES.has(enabled)) return { dependency: entry.dependency, skipReason: 'disabled' };

    const settings = resolveSettings(entry, resolver, problems);
    return { dependency: entry.dependency, run: () => entry.definition.check(settings) };
  });

  return { checks, problems };
}
