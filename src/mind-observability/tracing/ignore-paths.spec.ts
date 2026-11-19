/**
 * Testes executados:
 * - não devolve caminho extra quando a variável está ausente ou em branco
 * - devolve os caminhos extras sem espaços e sem repetição
 * - ignora as rotas de saúde sob qualquer prefixo, com ou sem query string
 * - ignora os caminhos extras exatos, com ou sem query string
 * - não ignora outros caminhos, segmentos parecidos, prefixos dos extras nem uma requisição sem url
 */

import { ignoreIncomingRequest, parseIgnorePaths } from './ignore-paths';

/** Testes */
describe('ignore-paths', () => {
  it('não devolve caminho extra quando a variável está ausente ou em branco', () => {
    expect(parseIgnorePaths(undefined)).toEqual([]);
    expect(parseIgnorePaths('  ')).toEqual([]);
  });

  it('devolve os caminhos extras sem espaços e sem repetição', () => {
    expect(parseIgnorePaths(' /ping , /ready,/ping ')).toEqual(['/ping', '/ready']);
  });

  it('ignora as rotas de saúde sob qualquer prefixo, com ou sem query string', () => {
    const ignore = ignoreIncomingRequest([]);
    expect(ignore({ url: '/health' })).toBe(true);
    expect(ignore({ url: '/health/live' })).toBe(true);
    expect(ignore({ url: '/exemplo/health' })).toBe(true);
    expect(ignore({ url: '/mind-api-exemplo/feature-x/health?probe=1' })).toBe(true);
    expect(ignore({ url: '/api/health/live' })).toBe(true);
  });

  it('ignora os caminhos extras exatos, com ou sem query string', () => {
    const ignore = ignoreIncomingRequest(['/ping']);
    expect(ignore({ url: '/ping' })).toBe(true);
    expect(ignore({ url: '/ping?probe=1' })).toBe(true);
  });

  it('não ignora outros caminhos, segmentos parecidos, prefixos dos extras nem uma requisição sem url', () => {
    const ignore = ignoreIncomingRequest(['/ping']);
    expect(ignore({ url: '/health/trace' })).toBe(false);
    expect(ignore({ url: '/health/liveness' })).toBe(false);
    expect(ignore({ url: '/healthz' })).toBe(false);
    expect(ignore({ url: '/unhealth' })).toBe(false);
    expect(ignore({ url: '/ping/deep' })).toBe(false);
    expect(ignore({})).toBe(false);
  });
});
