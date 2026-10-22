import { ignoreIncomingRequest, parseIgnorePaths } from './ignore-paths';

describe('ignore-paths', () => {
  it('returns only /health/live when the variable is unset or blank', () => {
    expect(parseIgnorePaths(undefined)).toEqual(['/health/live']);
    expect(parseIgnorePaths('  ')).toEqual(['/health/live']);
  });

  it('adds trimmed extra paths after the default, without duplicates', () => {
    expect(parseIgnorePaths(' /ping , /health/live,/ready ')).toEqual(['/health/live', '/ping', '/ready']);
  });

  it('ignores the exact path, with or without a query string', () => {
    const ignore = ignoreIncomingRequest(['/health/live']);
    expect(ignore({ url: '/health/live' })).toBe(true);
    expect(ignore({ url: '/health/live?probe=1' })).toBe(true);
  });

  it('does not ignore other paths, prefixes or a missing url', () => {
    const ignore = ignoreIncomingRequest(['/health/live']);
    expect(ignore({ url: '/health/trace' })).toBe(false);
    expect(ignore({ url: '/health/liveness' })).toBe(false);
    expect(ignore({})).toBe(false);
  });
});
