/**
 * @file Demo seeding: fills an EMPTY database with the deterministic demo dataset (FR-3).
 *
 * Used three ways:
 * - `npm run db:seed` from the command line;
 * - automatically on server start when the database has no organizations (first run);
 * - `POST /api/meta/reset-demo` (DEMO_MODE only), via {@link reseed}.
 *
 * The same {@link buildSeed} that powers the browser mock produces the data. The server passes a
 * real bcrypt hasher, so the demo accounts log in exactly like production accounts.
 */
import bcrypt from 'bcrypt';
import { buildSeed } from '@shared/demo/seed';
import type { DataSnapshot } from '@shared/domain/snapshot';
import { config } from '../config';
import { emptySnapshot, loadSnapshot, persistChanges } from '../repositories/snapshotRepository';
import { createDb, type Db } from './db';

/**
 * Builds the demo dataset with bcrypt password hashes.
 * @returns The seed snapshot.
 */
export function demoData(): DataSnapshot {
  return buildSeed({ hash: (pw) => bcrypt.hashSync(pw, config.bcryptRounds) });
}

/**
 * Seeds the database if it holds no organizations yet.
 * @param db - Prisma client.
 * @returns Whether anything was inserted.
 */
export async function seedIfEmpty(db: Db): Promise<boolean> {
  const anyOrg = await db.orm.Organization.first();
  if (anyOrg) return false;
  await db.transaction((tx) => persistChanges(tx, emptySnapshot(), demoData()));
  return true;
}

/**
 * Replaces all data with a fresh demo dataset.
 *
 * Sign-ins survive for everyone who still exists in the fresh data (matched by email, since ids
 * may change), so resetting the demo in one browser doesn't sign out every other browser.
 * Sign-ins of people who aren't in the demo data end.
 * @param db - Prisma client.
 * @returns How many sign-ins were kept.
 */
export async function reseed(db: Db): Promise<number> {
  const current = await loadSnapshot(db);
  const fresh = demoData();
  const emailOf = new Map(current.users.map((u) => [u.id, u.email.toLowerCase()]));
  const freshIdOf = new Map(fresh.users.map((u) => [u.email.toLowerCase(), u.id]));
  let kept = 0;
  await db.transaction(async (tx) => {
    const sessions = [];
    for await (const row of tx.orm.AuthSession.all()) sessions.push(row);
    await tx.orm.AuthSession.where((s) => s.id.neq('')).deleteAll();
    // Delete everything first (ids in the fresh seed reuse the old ones), then insert.
    await persistChanges(tx, current, emptySnapshot());
    await persistChanges(tx, emptySnapshot(), fresh);
    for (const session of sessions) {
      const email = emailOf.get(session.userId);
      const userId = email && freshIdOf.get(email);
      if (!userId) continue;
      await tx.orm.AuthSession.create({ ...session, userId });
      kept += 1;
    }
  });
  return kept;
}

// CLI: `npm run db:seed`
if (import.meta.url === `file://${process.argv[1]}`) {
  const db = createDb(config.databasePath);
  const inserted = await seedIfEmpty(db);
  console.log(inserted ? 'Seeded the demo data.' : 'Database already has data; left it as is.');
  await db.close();
}
