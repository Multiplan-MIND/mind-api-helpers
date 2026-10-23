import {
  SESSION_REVOKED_PREFIX,
  SESSION_REVOKED_TTL_MARGIN_SECONDS,
  checkSession,
  isSessionRevoked,
  parseRequireSid,
  isValidSid,
  markSessionRevoked,
  markSessionsRevoked,
  sessionRevokedKey,
} from './session.helper';

const MARGIN = SESSION_REVOKED_TTL_MARGIN_SECONDS;

describe('session.helper', () => {
  let redis: { eval: jest.Mock; pipeline: jest.Mock };
  let pipeline: { eval: jest.Mock; exec: jest.Mock };

  beforeEach(() => {
    pipeline = { eval: jest.fn().mockReturnThis(), exec: jest.fn().mockResolvedValue([]) };
    redis = { eval: jest.fn(), pipeline: jest.fn().mockReturnValue(pipeline) };
  });

  it('should build the global key', () => {
    expect(SESSION_REVOKED_PREFIX).toBe('mind:session:revoked:');
    expect(sessionRevokedKey('abc')).toBe('mind:session:revoked:abc');
  });

  it.each([
    ['abc', true],
    ['', false],
    ['   ', false],
    [0, false],
    [null, false],
    [undefined, false],
  ])('isValidSid(%p) should be %p', (sid, expected) => {
    expect(isValidSid(sid)).toBe(expected);
  });

  describe('isSessionRevoked', () => {
    it('should return true when the key exists', async () => {
      redis.eval.mockResolvedValue(1);
      await expect(isSessionRevoked(redis as any, 'abc')).resolves.toBe(true);
    });

    it('should return false when the key does not exist', async () => {
      redis.eval.mockResolvedValue(0);
      await expect(isSessionRevoked(redis as any, 'abc')).resolves.toBe(false);
    });

    it('should pass the key as ARGV (numkeys 0) so the service keyPrefix is not applied', async () => {
      redis.eval.mockResolvedValue(0);
      await isSessionRevoked(redis as any, 'abc');
      expect(redis.eval).toHaveBeenCalledWith(expect.stringContaining('EXISTS'), 0, 'mind:session:revoked:abc');
    });

    it('should propagate Redis errors (caller decides fail-closed)', async () => {
      redis.eval.mockRejectedValue(new Error('redis down'));
      await expect(isSessionRevoked(redis as any, 'abc')).rejects.toThrow('redis down');
    });
  });

  describe('markSessionRevoked', () => {
    beforeEach(() => pipeline.exec.mockResolvedValue([[null, 'OK']]));

    it('should SET the key with the TTL rounded up plus the clock-skew margin', async () => {
      await expect(markSessionRevoked(redis as any, 'abc', 10.2)).resolves.toBe(true);
      expect(pipeline.eval).toHaveBeenCalledWith(
        expect.stringContaining('SET'),
        0,
        'mind:session:revoked:abc',
        11 + MARGIN,
      );
    });

    it.each([0, -5])('should not write when ttl is %p (session already expired)', async (ttl) => {
      await expect(markSessionRevoked(redis as any, 'abc', ttl)).resolves.toBe(false);
      expect(redis.pipeline).not.toHaveBeenCalled();
    });

    it.each([NaN, Infinity, -Infinity])('should throw a RangeError when ttl is %p', async (ttl) => {
      await expect(markSessionRevoked(redis as any, 'abc', ttl)).rejects.toThrow(RangeError);
      expect(redis.pipeline).not.toHaveBeenCalled();
    });

    it.each(['', '  ', undefined, null, 1])('should throw a TypeError when sid is %p', async (sid) => {
      await expect(markSessionRevoked(redis as any, sid as any, 10)).rejects.toThrow(TypeError);
      expect(redis.pipeline).not.toHaveBeenCalled();
    });

    it('should throw the Redis error when the write fails', async () => {
      pipeline.exec.mockResolvedValue([[new Error('boom'), null]]);
      await expect(markSessionRevoked(redis as any, 'abc', 10)).rejects.toThrow('boom');
    });
  });

  describe('markSessionsRevoked', () => {
    it('should write all valid items in one pipeline and skip expired ones', async () => {
      pipeline.exec.mockResolvedValue([
        [null, 'OK'],
        [null, 'OK'],
      ]);

      const result = await markSessionsRevoked(redis as any, [
        { sid: 'a', ttlSeconds: 60 },
        { sid: 'b', ttlSeconds: -1 },
        { sid: 'c', ttlSeconds: 30 },
      ]);

      expect(result).toEqual({ revoked: ['a', 'c'], failed: [] });
      expect(pipeline.eval).toHaveBeenCalledTimes(2);
      expect(pipeline.eval).toHaveBeenCalledWith(
        expect.stringContaining('SET'),
        0,
        'mind:session:revoked:a',
        60 + MARGIN,
      );
      expect(pipeline.exec).toHaveBeenCalledTimes(1);
    });

    it('should deduplicate by sid keeping the largest TTL', async () => {
      pipeline.exec.mockResolvedValue([[null, 'OK']]);

      const result = await markSessionsRevoked(redis as any, [
        { sid: 'a', ttlSeconds: 10 },
        { sid: 'a', ttlSeconds: 50 },
        { sid: 'a', ttlSeconds: 20 },
      ]);

      expect(result.revoked).toEqual(['a']);
      expect(pipeline.eval).toHaveBeenCalledTimes(1);
      expect(pipeline.eval).toHaveBeenCalledWith(expect.any(String), 0, 'mind:session:revoked:a', 50 + MARGIN);
    });

    it('should not open a pipeline when there is nothing to write', async () => {
      await expect(markSessionsRevoked(redis as any, [])).resolves.toEqual({ revoked: [], failed: [] });
      expect(redis.pipeline).not.toHaveBeenCalled();
    });

    it('should report which sids failed instead of throwing on the first error', async () => {
      const boom = new Error('boom');
      pipeline.exec.mockResolvedValue([
        [null, 'OK'],
        [boom, null],
      ]);

      const result = await markSessionsRevoked(redis as any, [
        { sid: 'a', ttlSeconds: 5 },
        { sid: 'b', ttlSeconds: 5 },
      ]);

      expect(result).toEqual({ revoked: ['a'], failed: [{ sid: 'b', error: boom }] });
    });

    it('should mark every sid as failed when the pipeline returns no replies', async () => {
      pipeline.exec.mockResolvedValue(null);

      const result = await markSessionsRevoked(redis as any, [{ sid: 'a', ttlSeconds: 5 }]);

      expect(result.revoked).toEqual([]);
      expect(result.failed).toEqual([{ sid: 'a', error: expect.any(Error) }]);
    });

    it('should reject invalid items before writing anything', async () => {
      await expect(
        markSessionsRevoked(redis as any, [
          { sid: 'a', ttlSeconds: 5 },
          { sid: '', ttlSeconds: 5 },
        ]),
      ).rejects.toThrow(TypeError);
      await expect(markSessionsRevoked(redis as any, [{ sid: 'a', ttlSeconds: NaN }])).rejects.toThrow(RangeError);
      expect(redis.pipeline).not.toHaveBeenCalled();
    });
  });

  describe('parseRequireSid', () => {
    it.each([undefined, '', '  ', 'false', 'FALSE', '0'])('should be false for %p', (raw) => {
      expect(parseRequireSid(raw)).toBe(false);
    });

    it.each(['true', 'TRUE', ' True ', '1'])('should be true for %p', (raw) => {
      expect(parseRequireSid(raw)).toBe(true);
    });

    it.each(['yes', 'on', 'ture', '2'])('should throw for %p', (raw) => {
      expect(() => parseRequireSid(raw)).toThrow(/Invalid SESSION_REQUIRE_SID/);
    });
  });

  describe('checkSession', () => {
    it('should classify a missing sid as legacy, or sid-required when required', async () => {
      await expect(checkSession(redis as any, undefined, false)).resolves.toBe('legacy');
      await expect(checkSession(redis as any, undefined, true)).resolves.toBe('sid-required');
      expect(redis.eval).not.toHaveBeenCalled();
    });

    it.each(['', '  ', 0, null, {}])(
      'should reject a present but invalid sid %p without touching Redis',
      async (sid) => {
        await expect(checkSession(redis as any, sid, false)).resolves.toBe('invalid-sid');
        expect(redis.eval).not.toHaveBeenCalled();
      },
    );

    it('should tell a revoked session from a valid one', async () => {
      redis.eval.mockResolvedValueOnce(1).mockResolvedValueOnce(0);
      await expect(checkSession(redis as any, 'abc', false)).resolves.toBe('revoked');
      await expect(checkSession(redis as any, 'abc', false)).resolves.toBe('ok');
    });

    it('should propagate Redis errors (caller fails closed)', async () => {
      redis.eval.mockRejectedValue(new Error('redis down'));
      await expect(checkSession(redis as any, 'abc', false)).rejects.toThrow('redis down');
    });
  });
});
