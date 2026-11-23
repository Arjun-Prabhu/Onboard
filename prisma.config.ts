/**
 * @file Prisma ORM 8 configuration: where the data contract lives, which SQLite file the CLI
 * talks to, and where migrations are stored.
 */
import fs from 'node:fs';
import path from 'node:path';
import { definePrismaConfig } from '@prisma/cli-engine';
import { defineConfig as ormConfig } from '@prisma/orm-sqlite/config';

/** SQLite file used by the CLI (`db migrate`, `migration status`). Same default as the server. */
const DATABASE_PATH = process.env.DATABASE_PATH ?? './data/onboard.db';

// SQLite creates the file but not its folder; make sure `data/` exists on a fresh checkout.
fs.mkdirSync(path.dirname(path.resolve(DATABASE_PATH)), { recursive: true });

export default definePrismaConfig({
  orm: ormConfig({
    contract: './server/prisma/contract.prisma',
    db: { connection: `file:${DATABASE_PATH}` },
    migrations: { dir: './server/prisma/migrations' },
  }),
});
