import { extractIp, extractRequestInfo } from './request-info.helper';

describe('request-info.helper', () => {
  describe('extractIp', () => {
    it('should use the first item of X-Forwarded-For', () => {
      expect(extractIp({ headers: { 'x-forwarded-for': '203.0.113.7, 10.0.0.1, 10.0.0.2' } })).toBe('203.0.113.7');
    });

    it('should trim spaces and accept a single value', () => {
      expect(extractIp({ headers: { 'x-forwarded-for': '  203.0.113.7  ' } })).toBe('203.0.113.7');
    });

    it('should join repeated headers (array) and take the first item', () => {
      expect(extractIp({ headers: { 'x-forwarded-for': ['203.0.113.7', '10.0.0.1'] } })).toBe('203.0.113.7');
    });

    it('should keep IPv6 addresses', () => {
      expect(extractIp({ headers: { 'x-forwarded-for': '2001:db8::1, 10.0.0.1' } })).toBe('2001:db8::1');
    });

    it('should fall back to req.ip then the socket when the header is empty or missing', () => {
      expect(extractIp({ headers: { 'x-forwarded-for': ' , ' }, ip: '198.51.100.2' })).toBe('198.51.100.2');
      expect(extractIp({ headers: {}, socket: { remoteAddress: '198.51.100.3' } })).toBe('198.51.100.3');
    });

    it('should return null when nothing is available', () => {
      expect(extractIp({ headers: {} })).toBeNull();
      expect(extractIp(undefined)).toBeNull();
    });
  });

  describe('extractRequestInfo', () => {
    it('should collect user agent and fingerprint headers', () => {
      const info = extractRequestInfo({
        headers: {
          'user-agent': 'Mozilla/5.0',
          'accept-language': 'pt-BR,pt;q=0.9',
          'accept-encoding': 'gzip, br',
          'sec-ch-ua': '"Chromium";v="120"',
          'sec-ch-ua-platform': '"Linux"',
          'sec-ch-ua-mobile': '?0',
          'x-forwarded-for': '203.0.113.7, 10.0.0.1',
        },
      });

      expect(info).toEqual({
        ip: '203.0.113.7',
        userAgent: 'Mozilla/5.0',
        headers: {
          acceptLanguage: 'pt-BR,pt;q=0.9',
          acceptEncoding: 'gzip, br',
          secChUa: '"Chromium";v="120"',
          secChUaPlatform: '"Linux"',
          secChUaMobile: '?0',
          xForwardedFor: '203.0.113.7, 10.0.0.1',
        },
      });
    });

    it('should return nulls for a request without headers', () => {
      expect(extractRequestInfo(undefined)).toEqual({
        ip: null,
        userAgent: null,
        headers: {
          acceptLanguage: null,
          acceptEncoding: null,
          secChUa: null,
          secChUaPlatform: null,
          secChUaMobile: null,
          xForwardedFor: null,
        },
      });
    });
  });
});
