#!/usr/bin/env -S node
import type { Contract as End } from '../../snapshots/71f206b908281f03608e89e571b6759a3cf1b2badf82a3070e04ae69c0c0be27/contract';
import endContract from '../../snapshots/71f206b908281f03608e89e571b6759a3cf1b2badf82a3070e04ae69c0c0be27/contract.json' with { type: 'json' };
import type { Contract as Start } from '../../snapshots/fbe17a2e572382583d7ebfc73b84443e88c2bc0d0f98d811b892e098801a7af1/contract';
import startContract from '../../snapshots/fbe17a2e572382583d7ebfc73b84443e88c2bc0d0f98d811b892e098801a7af1/contract.json' with { type: 'json' };
import { Migration, MigrationCLI, sql } from '@prisma/orm-sqlite/migration';

export default class M extends Migration<Start, End> {
  override readonly startContractJson = startContract;
  override readonly endContractJson = endContract;

  override get operations() {
    return [
      this.addColumn({
        table: 'OrgSkill',
        column: {
          name: 'description',
          typeSql: 'TEXT',
          codecRef: { codecId: 'sqlite/text@1' },
          nullable: true,
        },
      }),
      this.recreateTable({
        tableName: 'Program',
        contractTable: {
          columns: [
            {
              name: 'archived',
              typeSql: 'INTEGER',
              codecRef: { codecId: 'sqlite/integer@1' },
              nullable: false,
            },
            {
              name: 'description',
              typeSql: 'TEXT',
              codecRef: { codecId: 'sqlite/text@1' },
              nullable: false,
            },
            {
              name: 'endDate',
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
              name: 'name',
              typeSql: 'TEXT',
              codecRef: { codecId: 'sqlite/text@1' },
              nullable: false,
            },
            {
              name: 'oneOff',
              typeSql: 'INTEGER',
              codecRef: { codecId: 'sqlite/integer@1' },
              nullable: false,
            },
            {
              name: 'participantCount',
              typeSql: 'INTEGER',
              codecRef: { codecId: 'sqlite/integer@1' },
              nullable: false,
            },
            {
              name: 'siteId',
              typeSql: 'TEXT',
              codecRef: { codecId: 'sqlite/text@1' },
              nullable: false,
            },
            {
              name: 'startDate',
              typeSql: 'TEXT',
              codecRef: { codecId: 'sqlite/text@1' },
              nullable: false,
            },
            {
              name: 'targetRatio',
              typeSql: 'INTEGER',
              codecRef: { codecId: 'sqlite/integer@1' },
              nullable: true,
            },
            {
              name: 'type',
              typeSql: 'TEXT',
              codecRef: { codecId: 'sqlite/text@1' },
              nullable: false,
            },
          ],
          primaryKey: { columns: ['id'] },
          uniques: [],
          foreignKeys: [{ columns: ['siteId'], references: { table: 'Site', columns: ['id'] } }],
        },
        schemaColumnNames: [
          'archived',
          'description',
          'endDate',
          'id',
          'name',
          'participantCount',
          'siteId',
          'startDate',
          'targetRatio',
          'type',
        ],
        indexes: [{ name: 'Program_siteId_idx_cabdc5ab', columns: ['siteId'] }],
        summary: 'Recreates table Program to apply schema changes: database/Program/column:oneOff',
        postchecks: [
          {
            description: 'verify "oneOff" nullability on "Program"',
            sql: `SELECT COUNT(*) > 0 FROM pragma_table_info('Program') WHERE name = 'oneOff' AND "notnull" = 1`,
          },
        ],
        operationClass: 'additive',
        temporaryValues: { oneOff: sql`0` },
      }),
    ];
  }
}

MigrationCLI.run(import.meta.url, M);
