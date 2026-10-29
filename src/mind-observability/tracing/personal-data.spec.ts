/**
 * Testes executados:
 * - maskPersonalData
 *   - mascara telefones com e sem o DDI
 *   - mascara CPFs com e sem pontuação
 *   - mascara e-mails, também codificados em URL
 *   - mascara um e-mail colado ao domínio do anterior
 *   - mascara texto longo sem e-mail em tempo linear
 *   - mantém timestamps em milissegundos, números curtos e ids longos
 *   - mascara toda ocorrência, inclusive as adjacentes
 * - serializeRedisCommand
 *   - mantém o comando e a chave mascarada, nunca os valores
 *   - serializa um comando sem argumentos ou com chave binária
 * - maskSpanAttributes
 *   - reescreve só os atributos de URL e de consulta que carregam dado pessoal
 *   - deixa como está um span sem atributos legíveis
 */

import { Span } from '@opentelemetry/api';
import { maskPersonalData, maskSpanAttributes, serializeRedisCommand } from './personal-data';

/** Testes */
describe('personal-data', () => {
  describe('maskPersonalData', () => {
    it('mascara telefones com e sem o DDI', () => {
      expect(maskPersonalData('mind:exemplo:conversation-history:5521987654321')).toBe(
        'mind:exemplo:conversation-history:<redacted>',
      );
      expect(maskPersonalData('/customers/+5521987654321/orders')).toBe('/customers/<redacted>/orders');
      expect(maskPersonalData('phone=%2B552133334444')).toBe('phone=%2B<redacted>');
      expect(maskPersonalData('phone=21987654321&ddd=21')).toBe('phone=<redacted>&ddd=21');
      expect(maskPersonalData('user_2133334444')).toBe('user_<redacted>');
    });

    it('mascara CPFs com e sem pontuação', () => {
      expect(maskPersonalData('/people/123.456.789-09')).toBe('/people/<redacted>');
      expect(maskPersonalData('cpf=12345678909')).toBe('cpf=<redacted>');
    });

    it('mascara e-mails, também codificados em URL', () => {
      expect(maskPersonalData('email=ana.souza+mind@example.com.br&x=1')).toBe('email=<redacted>&x=1');
      expect(maskPersonalData('email=ana%40example.com')).toBe('email=<redacted>');
    });

    it('mascara um e-mail colado ao domínio do anterior', () => {
      expect(maskPersonalData('to=ana@example.com_bia@example.com')).toBe('to=<redacted><redacted>');
      expect(maskPersonalData('to=ana@example.co1bia@example.com')).toBe('to=<redacted><redacted>');
    });

    it('mascara texto longo sem e-mail em tempo linear', () => {
      /** Tentar o e-mail em toda posição levaria segundos com 100 mil caracteres; em tempo linear, menos de 1 ms. */
      const longTexts = ['a'.repeat(100_000), 'a%40'.repeat(25_000), `x@${'a.1'.repeat(33_000)}`];
      const start = performance.now();
      for (const text of longTexts) {
        expect(maskPersonalData(text)).toBe(text);
      }
      expect(performance.now() - start).toBeLessThan(500);
    });

    it('mantém timestamps em milissegundos, números curtos e ids longos', () => {
      expect(maskPersonalData('since=1761750000000&page=2&limit=100')).toBe('since=1761750000000&page=2&limit=100');
      expect(maskPersonalData('/orders/12345678/items/42')).toBe('/orders/12345678/items/42');
      expect(maskPersonalData('/messages/123456789012345678')).toBe('/messages/123456789012345678');
      expect(maskPersonalData('/conversations/65f1a2b3c4d5e6f708192a3b')).toBe(
        '/conversations/65f1a2b3c4d5e6f708192a3b',
      );
    });

    it('mascara toda ocorrência, inclusive as adjacentes', () => {
      expect(maskPersonalData('21987654321,21912345678')).toBe('<redacted>,<redacted>');
    });
  });

  describe('serializeRedisCommand', () => {
    it('mantém o comando e a chave mascarada, nunca os valores', () => {
      expect(serializeRedisCommand('set', ['mind:exemplo:5521987654321', '{"name":"Ana"}', 'EX', 3600])).toBe(
        'set mind:exemplo:<redacted> [3 other arguments]',
      );
      expect(serializeRedisCommand('get', ['mind:exemplo:session:42'])).toBe('get mind:exemplo:session:42');
    });

    it('serializa um comando sem argumentos ou com chave binária', () => {
      expect(serializeRedisCommand('ping', [])).toBe('ping');
      expect(serializeRedisCommand('get', [Buffer.from('key')])).toBe('get ?');
    });
  });

  describe('maskSpanAttributes', () => {
    /** Factories/helpers: span falso com os atributos dados. */
    const spanWith = (attributes: Record<string, unknown>) =>
      ({ attributes, setAttribute: jest.fn() }) as unknown as Span;

    it('reescreve só os atributos de URL e de consulta que carregam dado pessoal', () => {
      const span = spanWith({
        'url.full': 'https://api.example.com/customers/5521987654321?email=ana@example.com',
        'url.path': '/orders/42',
        'http.request.method': 'GET',
        'db.query.text': 'get mind:exemplo:21987654321',
      });
      maskSpanAttributes(span);

      expect(span.setAttribute).toHaveBeenCalledTimes(2);
      expect(span.setAttribute).toHaveBeenCalledWith(
        'url.full',
        'https://api.example.com/customers/<redacted>?email=<redacted>',
      );
      expect(span.setAttribute).toHaveBeenCalledWith('db.query.text', 'get mind:exemplo:<redacted>');
    });

    it('deixa como está um span sem atributos legíveis', () => {
      const span = { setAttribute: jest.fn() } as unknown as Span;
      expect(() => maskSpanAttributes(span)).not.toThrow();
      expect(span.setAttribute).not.toHaveBeenCalled();
    });
  });
});
