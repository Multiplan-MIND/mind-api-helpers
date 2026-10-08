import {
  SESSION_REVOKED_PREFIX,
  isSessionRevoked,
  markSessionRevoked,
  markSessionsRevoked,
  sessionRevokedKey,
} from './session.helper';

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
    it('should SET the key with the TTL rounded up', async () => {
      await expect(markSessionRevoked(redis as any, 'abc', 10.2)).resolves.toBe(true);
      expect(redis.eval).toHaveBeenCalledWith(expect.stringContaining('SET'), 0, 'mind:session:revoked:abc', 11);
    });

    it.each([0, -5, NaN])('should not write when ttl is %p', async (ttl) => {
      await expect(markSessionRevoked(redis as any, 'abc', ttl)).resolves.toBe(false);
      expect(redis.eval).not.toHaveBeenCalled();
    });
  });

  describe('markSessionsRevoked', () => {
    it('should write all valid items in one pipeline and skip expired ones', async () => {
      const count = await markSessionsRevoked(redis as any, [
        { sid: 'a', ttlSeconds: 60 },
        { sid: 'b', ttlSeconds: -1 },
        { sid: 'c', ttlSeconds: 30 },
      ]);

      expect(count).toBe(2);
      expect(pipeline.eval).toHaveBeenCalledTimes(2);
      expect(pipeline.eval).toHaveBeenCalledWith(expect.stringContaining('SET'), 0, 'mind:session:revoked:a', 60);
      expect(pipeline.exec).toHaveBeenCalledTimes(1);
    });

    it('should not open a pipeline when there is nothing to write', async () => {
      await expect(markSessionsRevoked(redis as any, [])).resolves.toBe(0);
      expect(redis.pipeline).not.toHaveBeenCalled();
    });

    it('should throw when any pipeline command fails', async () => {
      pipeline.exec.mockResolvedValue([
        [null, 'OK'],
        [new Error('boom'), null],
      ]);
      await expect(
        markSessionsRevoked(redis as any, [
          { sid: 'a', ttlSeconds: 5 },
          { sid: 'b', ttlSeconds: 5 },
        ]),
      ).rejects.toThrow('boom');
    });
  });
});
