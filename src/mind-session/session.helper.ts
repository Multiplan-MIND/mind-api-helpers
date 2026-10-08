import { Redis } from 'ioredis';

export const SESSION_REVOKED_PREFIX = 'mind:session:revoked:';

export function sessionRevokedKey(sid: string): string {
  return `${SESSION_REVOKED_PREFIX}${sid}`;
}

// Key goes in ARGV (numkeys = 0): ioredis only applies `keyPrefix` to key positions,
// and this key is global, the same for all services.
const EXISTS_SCRIPT = "return redis.call('EXISTS', ARGV[1])";
const SET_SCRIPT = "return redis.call('SET', ARGV[1], '1', 'EX', ARGV[2])";

export async function isSessionRevoked(redis: Redis, sid: string): Promise<boolean> {
  const exists = await redis.eval(EXISTS_SCRIPT, 0, sessionRevokedKey(sid));
  return Number(exists) === 1;
}

export async function markSessionRevoked(redis: Redis, sid: string, ttlSeconds: number): Promise<boolean> {
  const ttl = Math.ceil(ttlSeconds);
  if (!(ttl > 0)) return false;
  await redis.eval(SET_SCRIPT, 0, sessionRevokedKey(sid), ttl);
  return true;
}

export async function markSessionsRevoked(redis: Redis, items: { sid: string; ttlSeconds: number }[]): Promise<number> {
  const valid = items.map((i) => ({ sid: i.sid, ttl: Math.ceil(i.ttlSeconds) })).filter((i) => i.ttl > 0);
  if (!valid.length) return 0;

  const pipeline = redis.pipeline();
  for (const { sid, ttl } of valid) pipeline.eval(SET_SCRIPT, 0, sessionRevokedKey(sid), ttl);
  const results = await pipeline.exec();
  const failed = (results || []).find(([err]) => err);
  if (failed) throw failed[0];
  return valid.length;
}
