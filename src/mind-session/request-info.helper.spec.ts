import { extractIp, extractRequestInfo, headerValue } from './request-info.helper';

describe('request-info.helper', () => {
  describe('headerValue', () => {
    it('should trim, turn empty into null and join repeated headers', () => {
      expect(headerValue({ headers: { a: '  x  ' } }, 'a')).toBe('x');
      expect(headerValue({ headers: { a: '   ' } }, 'a')).toBeNull();
      expect(headerValue({ headers: { a: ['x', 'y'] } }, 'a')).toBe('x, y');
      expect(headerValue({ headers: {} }, 'a')).toBeNull();
      expect(headerValue(undefined, 'a')).toBeNull();
    });
  });

  describe('extractIp', () => {
    it('should use req.ip and ignore a client-supplied X-Forwarded-For', () => {
      expect(extractIp({ ip: '198.51.100.2', headers: { 'x-forwarded-for': '1.2.3.4' } })).toBe('198.51.100.2');
    });

    it('should not trust X-Forwarded-For when there is no req.ip', () => {
      expect(extractIp({ headers: { 'x-forwarded-for': '1.2.3.4' } })).toBeNull();
    });

    it('should fall back to the socket address', () => {
      expect(extractIp({ headers: {}, socket: { remoteAddress: '198.51.100.3' } })).toBe('198.51.100.3');
    });

    it('should accept IPv6 and IPv4-mapped IPv6', () => {
      expect(extractIp({ ip: '2001:db8::1' })).toBe('2001:db8::1');
      expect(extractIp({ ip: '::ffff:198.51.100.2' })).toBe('::ffff:198.51.100.2');
    });

    it.each(['not-an-ip', '1.2.3.4, 5.6.7.8', '<script>', '', 42])('should return null for invalid value %p', (ip) => {
      expect(extractIp({ ip })).toBeNull();
    });

    it('should return null when nothing is available', () => {
      expect(extractIp({ headers: {} })).toBeNull();
      expect(extractIp(undefined)).toBeNull();
    });
  });

  describe('extractRequestInfo', () => {
    it('should collect ip, user agent and fingerprint headers', () => {
      const info = extractRequestInfo({
        ip: '203.0.113.7',
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

    it('should read the ip from a given trusted header instead of req.ip', () => {
      const req = { ip: '10.0.0.9', headers: { 'mind-request-ip': '203.0.113.7' } };
      expect(extractRequestInfo(req, { ipHeader: 'mind-request-ip' }).ip).toBe('203.0.113.7');
    });

    it('should not fall back to req.ip when the trusted header is missing or invalid', () => {
      expect(extractRequestInfo({ ip: '10.0.0.9', headers: {} }, { ipHeader: 'mind-request-ip' }).ip).toBeNull();
      const bad = { ip: '10.0.0.9', headers: { 'mind-request-ip': 'garbage' } };
      expect(extractRequestInfo(bad, { ipHeader: 'mind-request-ip' }).ip).toBeNull();
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
