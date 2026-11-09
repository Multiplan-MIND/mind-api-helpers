/**
 * Testes executados:
 * - TemplateResolver.resolve
 *   - troca a referência pelo valor da variável
 *   - usa o padrão quando a variável falta ou está vazia
 *   - aceita padrão vazio
 *   - registra a variável sem padrão que falta e a troca por vazio
 *   - guarda como segredo só o valor de variável que entra em campo secreto
 * - TemplateResolver.resolveJson
 *   - troca as referências nos textos de objetos e listas e mantém os demais valores
 * - maskSecrets
 *   - troca cada ocorrência do segredo, o mais longo primeiro
 */

import { TemplateResolver, maskSecrets } from './template-resolver';

/** Factories/helpers */
function resolverFor(environment: NodeJS.ProcessEnv): TemplateResolver {
  return new TemplateResolver(environment);
}

/** Testes */
describe('TemplateResolver.resolve', () => {
  it('troca a referência pelo valor da variável', () => {
    expect(resolverFor({ HOST: 'db.example.com' }).resolve('mongodb://${HOST}/app')).toBe(
      'mongodb://db.example.com/app',
    );
  });

  it('usa o padrão quando a variável falta ou está vazia', () => {
    const resolver = resolverFor({ EMPTY: '' });

    expect(resolver.resolve('${MISSING:-6379}')).toBe('6379');
    expect(resolver.resolve('${EMPTY:-amqp}')).toBe('amqp');
    expect(resolver.missingVariables.size).toBe(0);
  });

  it('aceita padrão vazio', () => {
    const resolver = resolverFor({});

    expect(resolver.resolve('[${OPTIONS:-}]')).toBe('[]');
    expect(resolver.missingVariables.size).toBe(0);
  });

  it('registra a variável sem padrão que falta e a troca por vazio', () => {
    const resolver = resolverFor({ PRESENT: 'x' });

    expect(resolver.resolve('${FIRST}-${PRESENT}-${SECOND}')).toBe('-x-');
    expect([...resolver.missingVariables]).toEqual(['FIRST', 'SECOND']);
  });

  it('guarda como segredo só o valor de variável que entra em campo secreto', () => {
    const resolver = resolverFor({ TOKEN: 'token-value', HOST: 'api.example.com' });

    resolver.resolve('https://${HOST}');
    resolver.resolve('Bearer ${TOKEN}', true);
    resolver.resolve('${UNSET:-fallback}', true);

    expect([...resolver.secrets]).toEqual(['token-value']);
  });
});

describe('TemplateResolver.resolveJson', () => {
  it('troca as referências nos textos de objetos e listas e mantém os demais valores', () => {
    const resolver = resolverFor({ QUERY: '{ __typename }' });

    expect(resolver.resolveJson({ query: '${QUERY}', variables: [1, true, null, '${QUERY}'] }, true)).toEqual({
      query: '{ __typename }',
      variables: [1, true, null, '{ __typename }'],
    });
    expect(resolver.resolveJson(undefined)).toBeUndefined();
    expect([...resolver.secrets]).toEqual(['{ __typename }']);
  });
});

describe('maskSecrets', () => {
  it('troca cada ocorrência do segredo, o mais longo primeiro', () => {
    expect(maskSecrets('abc abcdef abc', ['abc', 'abcdef'])).toBe('*** *** ***');
    expect(maskSecrets('sem segredo', ['abc'])).toBe('sem segredo');
  });
});
