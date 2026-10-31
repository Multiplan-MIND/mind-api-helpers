import { isNullOrUndefined } from './validation.helper';

describe('isNullOrUndefined', () => {
  it.each([null, undefined])('should be true for %p', (value) => {
    expect(isNullOrUndefined(value)).toBe(true);
  });

  it.each([0, '', false, [], {}])('should be false for falsy-but-defined %p', (value) => {
    expect(isNullOrUndefined(value)).toBe(false);
  });
});
