import { MindError, jsonError, toError } from './error.helper';

describe('error.helper', () => {
  describe('toError', () => {
    it('should return the same instance when the value already is an Error', () => {
      const original = new Error('Errorrrr');
      expect(toError(original)).toBe(original);
    });

    it('should preserve subclasses of Error', () => {
      const original = new MindError('loyalty.exists', 'Loyalty already exists');
      const error = toError(original);
      expect(error).toBe(original);
      expect(error).toBeInstanceOf(MindError);
    });

    it('should use the string thrown as message', () => {
      expect(toError('Errorrrr').message).toBe('Errorrrr');
    });

    it('should use the message of a plain object', () => {
      expect(toError({ code: 11000, message: 'duplicate key' }).message).toBe('duplicate key');
    });

    it('should serialize objects without message', () => {
      expect(toError({ code: 11000 }).message).toBe('{"code":11000}');
    });

    it('should not throw on circular references', () => {
      const circular: Record<string, unknown> = { code: 11000 };
      circular.self = circular;
      expect(toError(circular)).toBeInstanceOf(Error);
    });

    it('should handle values without serialization', () => {
      expect(toError(undefined).message).toBe('undefined');
      expect(toError(null).message).toBe('null');
    });
  });

  describe('jsonError', () => {
    it('should accept values that are not Error', () => {
      expect(() => JSON.stringify(jsonError('Errorrrr'))).not.toThrow();
    });

    it('should preserve the fields of a plain object', () => {
      expect(jsonError({ code: 11000, message: 'duplicate key' })).toEqual({
        code: 11000,
        message: 'duplicate key',
      });
    });
  });
});
