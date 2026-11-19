/**
 * Testes executados:
 * - buildDependencyChecks
 *   - entrega à verificação cada campo resolvido, com o padrão do campo que o arquivo não define
 *   - dispensa a dependência com enabled vazio ou false sem cobrar as variáveis dela
 *   - aponta o valor fora do formato com o campo e a dependência
 *   - guarda como segredo só os valores dos campos secretos
 */

import { DependencyEntry } from './dependency-config';
import { DependencyCheck, buildDependencyChecks } from './dependency-checks';
import { defineDependency } from './dependency-definition';
import { field } from './fields';
import { TemplateResolver } from './template-resolver';

/** Fixtures */
const check = jest.fn().mockResolvedValue(undefined);

const service = defineDependency({
  fields: {
    url: field.url(),
    port: field.port({ default: '${SERVICE_PORT:-8080}' }),
    token: field.text({ default: '${SERVICE_TOKEN:-}', secret: true }),
    tags: field.textList(),
  },
  check,
});

/** Configuração */
afterEach(() => {
  jest.clearAllMocks();
});

/** Factories/helpers */
function entry(dependency: string, fields: Record<string, unknown>, enabled?: string): DependencyEntry {
  return { dependency, definition: service, enabled, fields };
}

async function runAll(checks: DependencyCheck[]): Promise<void> {
  for (const dependencyCheck of checks) {
    if (!('run' in dependencyCheck)) throw new Error(`${dependencyCheck.dependency} was skipped`);
    await dependencyCheck.run();
  }
}

/** Testes */
describe('buildDependencyChecks', () => {
  it('entrega à verificação cada campo resolvido, com o padrão do campo que o arquivo não define', async () => {
    const resolver = new TemplateResolver({ SERVICE_URL: 'https://service.example.com', TAG: 'blue' });
    const { checks, problems } = buildDependencyChecks(
      [entry('service', { url: '${SERVICE_URL}/health', tags: ['${TAG}'] })],
      resolver,
    );

    await runAll(checks);

    expect(problems).toEqual([]);
    expect(resolver.missingVariables.size).toBe(0);
    expect(check).toHaveBeenCalledWith({
      url: 'https://service.example.com/health',
      port: 8080,
      token: '',
      tags: ['blue'],
    });
  });

  it('dispensa a dependência com enabled vazio ou false sem cobrar as variáveis dela', () => {
    const resolver = new TemplateResolver({ TELEMETRY_ENABLED: 'FALSE' });
    const { checks, problems } = buildDependencyChecks(
      [
        entry('telemetry', { url: '${TELEMETRY_URL}' }, '${TELEMETRY_ENABLED}'),
        entry('optional', { url: '${OPTIONAL_URL}' }, '${OPTIONAL_URL:-}'),
      ],
      resolver,
    );

    expect(checks).toEqual([
      { dependency: 'telemetry', skipReason: 'disabled' },
      { dependency: 'optional', skipReason: 'disabled' },
    ]);
    expect(problems).toEqual([]);
    expect(resolver.missingVariables.size).toBe(0);
    expect(check).not.toHaveBeenCalled();
  });

  it('aponta o valor fora do formato com o campo e a dependência', () => {
    const resolver = new TemplateResolver({ SERVICE_PORT: '63a9' });
    const { problems } = buildDependencyChecks([entry('service', { url: 'not a url' })], resolver);

    expect(problems).toEqual([
      'url of "service" is not a valid URL',
      'port of "service" must be a number between 1 and 65535',
    ]);
  });

  it('guarda como segredo só os valores dos campos secretos', () => {
    const resolver = new TemplateResolver({ SERVICE_TOKEN: 'service-token', HOST: 'service.example.com' });

    buildDependencyChecks([entry('service', { url: 'https://${HOST}' })], resolver);

    expect([...resolver.secrets]).toEqual(['service-token']);
  });
});
