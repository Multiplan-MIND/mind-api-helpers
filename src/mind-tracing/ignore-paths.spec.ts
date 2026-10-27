import { ignoreIncomingRequest, parseIgnorePaths } from './ignore-paths';

describe('ignore-paths', () => {
  it('returns no extra path when the variable is unset or blank', () => {
    expect(parseIgnorePaths(undefined)).toEqual([]);
    expect(parseIgnorePaths('  ')).toEqual([]);
  });

  it('returns the trimmed extra paths, without duplicates', () => {
    expect(parseIgnorePaths(' /ping , /ready,/ping ')).toEqual(['/ping', '/ready']);
  });

  it('ignores the health routes under any prefix, with or without a query string', () => {
    const ignore = ignoreIncomingRequest([]);
    expect(ignore({ url: '/health' })).toBe(true);
    expect(ignore({ url: '/health/live' })).toBe(true);
    expect(ignore({ url: '/concierge/health' })).toBe(true);
    expect(ignore({ url: '/mind-api-concierge/feature-x/health?probe=1' })).toBe(true);
    expect(ignore({ url: '/api/health/live' })).toBe(true);
  });

  it('ignores the exact extra paths, with or without a query string', () => {
    const ignore = ignoreIncomingRequest(['/ping']);
    expect(ignore({ url: '/ping' })).toBe(true);
    expect(ignore({ url: '/ping?probe=1' })).toBe(true);
  });

  it('does not ignore other paths, look-alike segments, prefixes of extras or a missing url', () => {
    const ignore = ignoreIncomingRequest(['/ping']);
    expect(ignore({ url: '/health/trace' })).toBe(false);
    expect(ignore({ url: '/health/liveness' })).toBe(false);
    expect(ignore({ url: '/healthz' })).toBe(false);
    expect(ignore({ url: '/unhealth' })).toBe(false);
    expect(ignore({ url: '/ping/deep' })).toBe(false);
    expect(ignore({})).toBe(false);
  });
});
