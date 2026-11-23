/**
 * @file Vitest global setup: applies the Prisma migrations ONCE to a template SQLite file.
 * Each API test copies it, so tests run on a real, fully migrated database without paying for
 * `prisma db migrate` every time.
 */
import { execSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

/** Where the migrated template lives for this test run. */
export const TEMPLATE = path.join(os.tmpdir(), `onboard-test-template-${process.pid}.db`);

/** Migrates the template and exposes its path to the tests. */
export default function setup() {
  fs.rmSync(TEMPLATE, { force: true });
  execSync('npx prisma db migrate', {
    env: { ...process.env, DATABASE_PATH: TEMPLATE },
    stdio: 'ignore',
  });
  process.env.ONBOARD_TEST_TEMPLATE = TEMPLATE;
  return () => fs.rmSync(TEMPLATE, { force: true });
}
