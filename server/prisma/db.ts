/**
 * @file Prisma ORM 8 client for Onboard's SQLite database.
 *
 * The client is built from the emitted contract (`contract.json` + `contract.d.ts`, produced by
 * `npm run db:emit` from `contract.prisma`). Prisma 8 does not apply migrations from app code:
 * `npm start` runs `prisma db migrate` before the server boots.
 */
import fs from 'node:fs';
import path from 'node:path';
import sqlite from '@prisma/orm-sqlite/runtime';
import { contractFromJson } from '@prisma/orm-sqlite/static';
import type { Contract } from './contract.d';
import contractJson from './contract.json' with { type: 'json' };

/** The typed data contract. */
export const contract = contractFromJson<Contract>(contractJson);

/**
 * Opens a Prisma client on a SQLite file, creating its folder if needed.
 * @param databasePath - Path to the `.db` file.
 * @returns A connected Prisma client.
 */
export function createDb(databasePath: string) {
  fs.mkdirSync(path.dirname(databasePath), { recursive: true });
  return sqlite({ contract, path: databasePath });
}

/** A Onboard Prisma client. */
export type Db = ReturnType<typeof createDb>;
/** The transaction handle `db.transaction` passes to its callback. */
export type Tx = Parameters<Parameters<Db['transaction']>[0]>[0];
