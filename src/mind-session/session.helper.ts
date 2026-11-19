import { Redis } from 'ioredis';

export const SESSION_REVOKED_PREFIX = 'mind:session:revoked:';

// The key outlives the session by this margin, so a clock ahead on the revoking service
// does not let the revoked token back in during the last seconds of the session.
export const SESSION_REVOKED_TTL_MARGIN_SECONDS = 60;

export interface SessionRevocation {
  sid: string;
  ttlSeconds: number;
}

export interface SessionsRevokedResult {
  revoked: string[];
  failed: { sid: string; error: Error }[];
}

export function sessionRevokedKey(sid: string): string {
  return `${SESSION_REVOKED_PREFIX}${sid}`;
}

// Key goes in ARGV (numkeys = 0): ioredis only applies `keyPrefix` to key positions,
// and this key is global, the same for all services. This assumes a standalone Redis
// without per-prefix ACL; Redis Cluster would need the key as a real KEYS argument.
const EXISTS_SCRIPT = "return redis.call('EXISTS', ARGV[1])";
const SET_SCRIPT = "return redis.call('SET', ARGV[1], '1', 'EX', ARGV[2])";

export function isValidSid(sid: unknown): sid is string {
  return typeof sid === 'string' && sid.trim().length > 0;
}

function assertValidSid(sid: unknown): asserts sid is string {
  if (!isValidSid(sid)) throw new TypeError('sid must be a non-empty string');
}

// null: the session is already expired, nothing to revoke
function revocationTtl(ttlSeconds: number): number | null {
  if (!Number.isFinite(ttlSeconds)) throw new RangeError(`ttlSeconds must be a finite number, got ${ttlSeconds}`);
  const ttl = Math.ceil(ttlSeconds);
  return ttl > 0 ? ttl + SESSION_REVOKED_TTL_MARGIN_SECONDS : null;
}

// Read once at boot: an unknown value must fail there, not silently keep legacy tokens (which cannot be revoked) accepted.
export function parseRequireSid(raw: string | undefined): boolean {
  const value = (raw ?? '').trim().toLowerCase();
  if (['', 'false', '0'].includes(value)) return false;
  if (['true', '1'].includes(value)) return true;
  throw new Error(`Invalid SESSION_REQUIRE_SID: "${raw}" (expected true, false, 1 or 0)`);
}

export type SessionCheck = 'ok' | 'legacy' | 'sid-required' | 'invalid-sid' | 'revoked';

// Token without the `sid` claim is legacy (accepted unless `requireSid`); a `sid` that is present but not a
// non-empty string is never legacy. Redis errors propagate: the caller must fail closed.
export async function checkSession(redis: Redis, sid: unknown, requireSid: boolean): Promise<SessionCheck> {
  if (sid === undefined) return requireSid ? 'sid-required' : 'legacy';
  if (!isValidSid(sid)) return 'invalid-sid';
  return (await isSessionRevoked(redis, sid)) ? 'revoked' : 'ok';
}

export async function isSessionRevoked(redis: Redis, sid: string): Promise<boolean> {
  const exists = await redis.eval(EXISTS_SCRIPT, 0, sessionRevokedKey(sid));
  return Number(exists) === 1;
}

export async function markSessionRevoked(redis: Redis, sid: string, ttlSeconds: number): Promise<boolean> {
  const { revoked, failed } = await markSessionsRevoked(redis, [{ sid, ttlSeconds }]);
  if (failed.length) throw failed[0].error;
  return revoked.length === 1;
}

// Invalid input (blank sid, non-finite ttl) throws before anything is written. Redis failures are
// reported per sid in `failed`; SET is idempotent, so repeating the whole call is safe.
export async function markSessionsRevoked(redis: Redis, items: SessionRevocation[]): Promise<SessionsRevokedResult> {
  const ttlBySid = new Map<string, number>();
  for (const { sid, ttlSeconds } of items) {
    assertValidSid(sid);
    const ttl = revocationTtl(ttlSeconds);
    if (ttl !== null) ttlBySid.set(sid, Math.max(ttl, ttlBySid.get(sid) ?? 0));
  }

  const result: SessionsRevokedResult = { revoked: [], failed: [] };
  if (!ttlBySid.size) return result;

  const entries = [...ttlBySid];
  const pipeline = redis.pipeline();
  for (const [sid, ttl] of entries) pipeline.eval(SET_SCRIPT, 0, sessionRevokedKey(sid), ttl);
  const replies = (await pipeline.exec()) ?? [];

  entries.forEach(([sid], i) => {
    const error = replies[i] ? replies[i][0] : new Error('No reply from Redis pipeline');
    if (error) result.failed.push({ sid, error });
    else result.revoked.push(sid);
  });
  return result;
}
