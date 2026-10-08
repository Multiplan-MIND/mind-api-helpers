import { logPrefix } from './mind-logger.util';

describe('logPrefix', () => {
  it('should include pid and method', () => {
    expect(logPrefix('find')).toBe(`${process.pid}|find`);
  });

  it('should join infos with ;', () => {
    expect(logPrefix('find', ['a', 'b'])).toBe(`${process.pid}|find#a;b`);
  });

  it('should handle an empty infos list', () => {
    expect(logPrefix('find', [])).toBe(`${process.pid}|find#`);
  });
});
