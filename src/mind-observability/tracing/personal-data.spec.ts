import { Span } from '@opentelemetry/api';
import { maskPersonalData, maskSpanAttributes, serializeRedisCommand } from './personal-data';

describe('personal-data', () => {
  describe('maskPersonalData', () => {
    it('masks phone numbers with and without the country code', () => {
      expect(maskPersonalData('mind:concierge:conversation-history:5521987654321')).toBe(
        'mind:concierge:conversation-history:<redacted>',
      );
      expect(maskPersonalData('/customers/+5521987654321/orders')).toBe('/customers/<redacted>/orders');
      expect(maskPersonalData('phone=%2B552133334444')).toBe('phone=%2B<redacted>');
      expect(maskPersonalData('phone=21987654321&ddd=21')).toBe('phone=<redacted>&ddd=21');
      expect(maskPersonalData('user_2133334444')).toBe('user_<redacted>');
    });

    it('masks CPFs with and without punctuation', () => {
      expect(maskPersonalData('/people/123.456.789-09')).toBe('/people/<redacted>');
      expect(maskPersonalData('cpf=12345678909')).toBe('cpf=<redacted>');
    });

    it('masks e-mails, also URL-encoded', () => {
      expect(maskPersonalData('email=ana.souza+mind@example.com.br&x=1')).toBe('email=<redacted>&x=1');
      expect(maskPersonalData('email=ana%40example.com')).toBe('email=<redacted>');
    });

    it('keeps millisecond timestamps, short numbers and long ids', () => {
      expect(maskPersonalData('since=1761750000000&page=2&limit=100')).toBe('since=1761750000000&page=2&limit=100');
      expect(maskPersonalData('/orders/12345678/items/42')).toBe('/orders/12345678/items/42');
      expect(maskPersonalData('/messages/123456789012345678')).toBe('/messages/123456789012345678');
      expect(maskPersonalData('/conversations/65f1a2b3c4d5e6f708192a3b')).toBe(
        '/conversations/65f1a2b3c4d5e6f708192a3b',
      );
    });

    it('masks every occurrence, including adjacent ones', () => {
      expect(maskPersonalData('21987654321,21912345678')).toBe('<redacted>,<redacted>');
    });
  });

  describe('serializeRedisCommand', () => {
    it('keeps the command and the masked key, never the values', () => {
      expect(serializeRedisCommand('set', ['mind:concierge:5521987654321', '{"name":"Ana"}', 'EX', 3600])).toBe(
        'set mind:concierge:<redacted> [3 other arguments]',
      );
      expect(serializeRedisCommand('get', ['mind:concierge:session:42'])).toBe('get mind:concierge:session:42');
    });

    it('serializes a command without arguments or with a binary key', () => {
      expect(serializeRedisCommand('ping', [])).toBe('ping');
      expect(serializeRedisCommand('get', [Buffer.from('key')])).toBe('get ?');
    });
  });

  describe('maskSpanAttributes', () => {
    const spanWith = (attributes: Record<string, unknown>) =>
      ({ attributes, setAttribute: jest.fn() }) as unknown as Span;

    it('rewrites only the URL and query attributes that carry personal data', () => {
      const span = spanWith({
        'url.full': 'https://api.example.com/customers/5521987654321?email=ana@example.com',
        'url.path': '/orders/42',
        'http.request.method': 'GET',
        'db.query.text': 'get mind:concierge:21987654321',
      });
      maskSpanAttributes(span);

      expect(span.setAttribute).toHaveBeenCalledTimes(2);
      expect(span.setAttribute).toHaveBeenCalledWith(
        'url.full',
        'https://api.example.com/customers/<redacted>?email=<redacted>',
      );
      expect(span.setAttribute).toHaveBeenCalledWith('db.query.text', 'get mind:concierge:<redacted>');
    });

    it('leaves a span without readable attributes alone', () => {
      const span = { setAttribute: jest.fn() } as unknown as Span;
      expect(() => maskSpanAttributes(span)).not.toThrow();
      expect(span.setAttribute).not.toHaveBeenCalled();
    });
  });
});
