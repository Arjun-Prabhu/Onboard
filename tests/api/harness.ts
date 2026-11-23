/**
 * @file Test harness: a fresh, seeded Onboard server per test, on its own database copy.
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { DEMO_ACCOUNTS } from '@shared/demo/seed';
import { createApp } from '../../server/app';
import { createDb } from '../../server/prisma/db';
import { seedIfEmpty } from '../../server/prisma/seed';
import { Store } from '../../server/store';

/** A running test server. */
export interface TestServer {
  app: ReturnType<typeof createApp>;
  store: Store;
  dbPath: string;
  /** Signs a demo account in and returns a cookie-keeping agent. */
  as(key: (typeof DEMO_ACCOUNTS)[number]['key']): Promise<ReturnType<typeof request.agent>>;
  /** Closes the database and deletes the copy. */
  close(): Promise<void>;
}

/**
 * Starts a seeded server on a copy of the migrated template database.
 * @returns The test server.
 */
export async function startServer(): Promise<TestServer> {
  const template = process.env.ONBOARD_TEST_TEMPLATE as string;
  const dbPath = path.join(os.tmpdir(), `onboard-test-${randomUUID()}.db`);
  fs.copyFileSync(template, dbPath);
  const db = createDb(dbPath);
  await seedIfEmpty(db);
  const store = new Store(db);
  const app = createApp(store);
  return {
    app,
    store,
    dbPath,
    async as(key) {
      const account = DEMO_ACCOUNTS.find((a) => a.key === key)!;
      const agent = request.agent(app);
      await agent
        .post('/api/auth/login')
        .send({ email: account.email, password: account.password })
        .expect(200);
      return agent;
    },
    async close() {
      await db.close();
      fs.rmSync(dbPath, { force: true });
    },
  };
}
