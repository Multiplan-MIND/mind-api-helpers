/**
 * Testes executados:
 * - field.text
 *   - resolve o modelo do arquivo e, sem ele, o padrão
 *   - é obrigatório quando não tem padrão
 *   - guarda como segredo só o valor do campo secreto
 * - field.url
 *   - aponta a URL inválida, inclusive a vazia por padrão vazio, e deixa a da variável ausente para a lista dela
 * - field.port
 *   - converte o texto e o número em porta
 *   - aponta a porta fora do intervalo, inclusive a vazia por padrão vazio, e deixa a da variável ausente para a lista dela
 * - field.textList e field.textMap
 *   - resolvem cada item e ficam vazios sem valor no arquivo
 * - field.json
 *   - troca as variáveis só nos textos e fica ausente sem valor no arquivo
 * - field.flag
 *   - usa o padrão sem valor no arquivo
 * - field.oneOf
 *   - aceita só os valores da lista e usa o padrão sem valor no arquivo
 */

import { Field, field } from './fields';
import { TemplateResolver } from './template-resolver';

/** Factories/helpers */
function resolveField<Value>(target: Field<Value>, raw: unknown, environment: NodeJS.ProcessEnv = {}) {
  const resolver = new TemplateResolver(environment);
  const problems: string[] = [];
  const value = target.resolve(raw, { resolver, invalid: (reason) => problems.push(reason) });

  return { value, problems, secrets: [...resolver.secrets], missingVariables: [...resolver.missingVariables] };
}

/** Testes */
describe('field.text', () => {
  it('resolve o modelo do arquivo e, sem ele, o padrão', () => {
    const host = field.text({ default: '${HOST:-localhost}' });

    expect(resolveField(host, '${OTHER_HOST}', { OTHER_HOST: 'db.example.com' }).value).toBe('db.example.com');
    expect(resolveField(host, undefined).value).toBe('localhost');
    expect(host.accepts(1)).toBe(false);
    expect(host.description).toBe('a string');
  });

  it('é obrigatório quando não tem padrão', () => {
    expect(field.text().required).toBe(true);
    expect(field.text({ default: '' }).required).toBe(false);
  });

  it('guarda como segredo só o valor do campo secreto', () => {
    const environment = { USER: 'mind', HOST: 'db.example.com' };

    expect(resolveField(field.text({ secret: true }), '${USER}', environment).secrets).toEqual(['mind']);
    expect(resolveField(field.text(), '${HOST}', environment).secrets).toEqual([]);
  });
});

describe('field.url', () => {
  it('aponta a URL inválida, inclusive a vazia por padrão vazio, e deixa a da variável ausente para a lista dela', () => {
    expect(resolveField(field.url(), 'https://api.example.com').problems).toEqual([]);
    expect(resolveField(field.url(), 'not a url').problems).toEqual(['is not a valid URL']);
    expect(resolveField(field.url(), '${API_URL:-}').problems).toEqual(['is not a valid URL']);
    expect(resolveField(field.url({ default: '${API_URL:-}' }), undefined).problems).toEqual(['is not a valid URL']);

    const missing = resolveField(field.url(), '${API_URL}');
    expect(missing.problems).toEqual([]);
    expect(missing.missingVariables).toEqual(['API_URL']);
  });
});

describe('field.port', () => {
  it('converte o texto e o número em porta', () => {
    const port = field.port({ default: '${PORT:-6379}' });

    expect(resolveField(port, undefined).value).toBe(6379);
    expect(resolveField(port, undefined, { PORT: '6380' }).value).toBe(6380);
    expect(resolveField(port, 5672).value).toBe(5672);
    expect(port.accepts(5672.5)).toBe(false);
  });

  it('aponta a porta fora do intervalo, inclusive a vazia por padrão vazio, e deixa a da variável ausente para a lista dela', () => {
    expect(resolveField(field.port(), '63a9').problems).toEqual(['must be a number between 1 and 65535']);
    expect(resolveField(field.port(), 70_000).problems).toEqual(['must be a number between 1 and 65535']);
    expect(resolveField(field.port(), '${PORT:-}').problems).toEqual(['must be a number between 1 and 65535']);
    expect(resolveField(field.port(), '${PORT}').problems).toEqual([]);
  });
});

describe('field.textList e field.textMap', () => {
  it('resolvem cada item e ficam vazios sem valor no arquivo', () => {
    const environment = { EXCHANGE: 'created', TOKEN: 'token-value' };

    expect(resolveField(field.textList(), ['${EXCHANGE}', 'processed'], environment).value).toEqual([
      'created',
      'processed',
    ]);
    expect(resolveField(field.textList(), undefined).value).toEqual([]);
    expect(field.textList().accepts(['a', 1])).toBe(false);

    const headers = resolveField(field.textMap({ secret: true }), { authorization: 'Bearer ${TOKEN}' }, environment);
    expect(headers.value).toEqual({ authorization: 'Bearer token-value' });
    expect(headers.secrets).toEqual(['token-value']);
    expect(resolveField(field.textMap(), undefined).value).toEqual({});
    expect(field.textMap().accepts({ token: 1 })).toBe(false);
  });
});

describe('field.json', () => {
  it('troca as variáveis só nos textos e fica ausente sem valor no arquivo', () => {
    expect(resolveField(field.json(), { query: '${QUERY}', limit: 1 }, { QUERY: '{ __typename }' }).value).toEqual({
      query: '{ __typename }',
      limit: 1,
    });
    expect(resolveField(field.json(), undefined).value).toBeUndefined();
  });
});

describe('field.flag', () => {
  it('usa o padrão sem valor no arquivo', () => {
    expect(resolveField(field.flag(), undefined).value).toBe(false);
    expect(resolveField(field.flag({ default: true }), undefined).value).toBe(true);
    expect(resolveField(field.flag(), true).value).toBe(true);
    expect(field.flag().accepts('true')).toBe(false);
  });
});

describe('field.oneOf', () => {
  it('aceita só os valores da lista e usa o padrão sem valor no arquivo', () => {
    const method = field.oneOf(['GET', 'POST'], { default: 'GET' });

    expect(method.accepts('POST')).toBe(true);
    expect(method.accepts('DELETE')).toBe(false);
    expect(method.description).toBe('one of GET, POST');
    expect(resolveField(method, 'POST').value).toBe('POST');
    expect(resolveField(method, undefined).value).toBe('GET');
  });
});
