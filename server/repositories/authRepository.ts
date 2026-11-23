/**
 * @file Sign-ins behind the httpOnly cookie (NFR-7), stored in the `AuthSession` table.
 *
 * The browser holds a random 256-bit token; the database holds only its SHA-256 hash, so a copy
 * of the database file can't be used to sign in as anyone.
 *
 * A sign-in **slides**: it ends after `sessionIdleHours` without activity, and each request made
 * while signed in pushes that deadline forward — at most once every `sessionTouchMinutes`, so
 * ordinary clicking doesn't write to the database every time. However active the person is, a
 * sign-in never outlives `sessionMaxDays` from when it started.
 */
import { createHash, randomBytes } from 'node:crypto';
import { config } from '../config';
import type { Db } from '../prisma/db';
import { newId } from '../services/context';

const HOUR = 3_600_000;
const MINUTE = 60_000;

/**
 * Hashes a session token for storage and lookup.
 * @param token - Raw token from the cookie.
 * @returns Hex SHA-256.
 */
const hashToken = (token: string) => createHash('sha256').update(token).digest('hex');

/**
 * The latest a sign-in may last: `sessionMaxDays` after it started.
 * @param createdAt - When it started (ISO).
 * @returns Epoch milliseconds.
 */
const hardLimit = (createdAt: string) =>
  new Date(createdAt).getTime() + config.sessionMaxDays * 24 * HOUR;

/**
 * The next inactivity deadline from a moment, never past the hard limit.
 * @param now - Epoch milliseconds.
 * @param createdAt - When the sign-in started (ISO).
 * @returns The new expiry.
 */
const nextExpiry = (now: number, createdAt: string) =>
  new Date(Math.min(now + config.sessionIdleHours * HOUR, hardLimit(createdAt)));

/**
 * Starts a sign-in for a person.
 * @param db - Prisma client.
 * @param userId - Person signing in.
 * @returns The raw token (goes only into the cookie) and when it expires if left idle.
 */
export async function createSession(
  db: Db,
  userId: string,
): Promise<{ token: string; expiresAt: Date }> {
  const token = randomBytes(32).toString('base64url');
  const now = new Date();
  const expiresAt = nextExpiry(now.getTime(), now.toISOString());
  await db.orm.AuthSession.create({
    id: newId('as'),
    tokenHash: hashToken(token),
    userId,
    createdAt: now.toISOString(),
    expiresAt: expiresAt.toISOString(),
    lastSeenAt: now.toISOString(),
  });
  return { token, expiresAt };
}

/** Who a cookie belongs to, and a new expiry when this request extended the sign-in. */
export interface SessionLookup {
  userId: string;
  /** Set when the sign-in was just extended, so the cookie can be refreshed to match. */
  renewedUntil?: Date;
}

/**
 * Resolves a cookie token to the signed-in person, extending the sign-in when it's due.
 * @param db - Prisma client.
 * @param token - Raw token.
 * @returns The person (and a new expiry if extended), or undefined if unknown or expired.
 */
export async function lookupSession(db: Db, token: string): Promise<SessionLookup | undefined> {
  const session = await db.orm.AuthSession.where({ tokenHash: hashToken(token) }).first();
  if (!session) return undefined;
  const now = Date.now();
  if (new Date(session.expiresAt).getTime() <= now || hardLimit(session.createdAt) <= now) {
    await db.orm.AuthSession.where({ id: session.id }).delete();
    return undefined;
  }
  // Sign-ins from before this column existed have an empty value: count from their start.
  const lastSeen = new Date(session.lastSeenAt || session.createdAt).getTime();
  if (now - lastSeen < config.sessionTouchMinutes * MINUTE) return { userId: session.userId };
  const renewedUntil = nextExpiry(now, session.createdAt);
  await db.orm.AuthSession.where({ id: session.id }).update({
    lastSeenAt: new Date(now).toISOString(),
    expiresAt: renewedUntil.toISOString(),
  });
  return { userId: session.userId, renewedUntil };
}

/**
 * Ends a sign-in (logout).
 * @param db - Prisma client.
 * @param token - Raw token.
 */
export async function deleteSession(db: Db, token: string): Promise<void> {
  await db.orm.AuthSession.where({ tokenHash: hashToken(token) }).deleteAll();
}

/**
 * Removes expired sign-ins (run at startup).
 * @param db - Prisma client.
 */
export async function deleteExpiredSessions(db: Db): Promise<void> {
  const now = new Date().toISOString();
  await db.orm.AuthSession.where((s) => s.expiresAt.lte(now)).deleteAll();
}
