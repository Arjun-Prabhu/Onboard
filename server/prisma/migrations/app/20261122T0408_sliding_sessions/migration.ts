#!/usr/bin/env -S node
import type { Contract as End } from '../../snapshots/09272109a9ebae45d1be09bb29543dcd319d1ee3fbb28b6acd17ab240e25701c/contract';
import endContract from '../../snapshots/09272109a9ebae45d1be09bb29543dcd319d1ee3fbb28b6acd17ab240e25701c/contract.json' with { type: 'json' };
import type { Contract as Start } from '../../snapshots/71f206b908281f03608e89e571b6759a3cf1b2badf82a3070e04ae69c0c0be27/contract';
import startContract from '../../snapshots/71f206b908281f03608e89e571b6759a3cf1b2badf82a3070e04ae69c0c0be27/contract.json' with { type: 'json' };
import { Migration, MigrationCLI, sql } from '@prisma/orm-sqlite/migration';

export default class M extends Migration<Start, End> {
  override readonly startContractJson = startContract;
  override readonly endContractJson = endContract;

  override get operations() {
    return [
      this.recreateTable({
        tableName: 'AuthSession',
        contractTable: {
          columns: [
            {
              name: 'createdAt',
              typeSql: 'TEXT',
              codecRef: { codecId: 'sqlite/text@1' },
              nullable: false,
            },
            {
              name: 'expiresAt',
              typeSql: 'TEXT',
              codecRef: { codecId: 'sqlite/text@1' },
              nullable: false,
            },
            {
              name: 'id',
              typeSql: 'TEXT',
              codecRef: { codecId: 'sqlite/text@1' },
              nullable: false,
            },
            {
              name: 'lastSeenAt',
              typeSql: 'TEXT',
              codecRef: { codecId: 'sqlite/text@1' },
              nullable: false,
            },
            {
              name: 'tokenHash',
              typeSql: 'TEXT',
              codecRef: { codecId: 'sqlite/text@1' },
              nullable: false,
            },
            {
              name: 'userId',
              typeSql: 'TEXT',
              codecRef: { codecId: 'sqlite/text@1' },
              nullable: false,
            },
          ],
          primaryKey: { columns: ['id'] },
          uniques: [{ columns: ['tokenHash'] }],
          foreignKeys: [{ columns: ['userId'], references: { table: 'User', columns: ['id'] } }],
        },
        schemaColumnNames: ['createdAt', 'expiresAt', 'id', 'tokenHash', 'userId'],
        indexes: [{ name: 'AuthSession_userId_idx_a489d58a', columns: ['userId'] }],
        summary:
          'Recreates table AuthSession to apply schema changes: database/AuthSession/column:lastSeenAt',
        postchecks: [
          {
            description: 'verify "lastSeenAt" nullability on "AuthSession"',
            sql: `SELECT COUNT(*) > 0 FROM pragma_table_info('AuthSession') WHERE name = 'lastSeenAt' AND "notnull" = 1`,
          },
        ],
        operationClass: 'additive',
        temporaryValues: { lastSeenAt: sql`''` },
      }),
    ];
  }
}

MigrationCLI.run(import.meta.url, M);
