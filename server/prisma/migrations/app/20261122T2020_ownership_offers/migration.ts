#!/usr/bin/env -S node
import type { Contract as Start } from '../../snapshots/09272109a9ebae45d1be09bb29543dcd319d1ee3fbb28b6acd17ab240e25701c/contract';
import startContract from '../../snapshots/09272109a9ebae45d1be09bb29543dcd319d1ee3fbb28b6acd17ab240e25701c/contract.json' with { type: 'json' };
import type { Contract as End } from '../../snapshots/887ab6b8d534d562d36585f2180ed191d75155bab8a2c79c8ffc3d1d02156136/contract';
import endContract from '../../snapshots/887ab6b8d534d562d36585f2180ed191d75155bab8a2c79c8ffc3d1d02156136/contract.json' with { type: 'json' };
import { Migration, MigrationCLI, col, primaryKey } from '@prisma/orm-sqlite/migration';

export default class M extends Migration<Start, End> {
  override readonly startContractJson = startContract;
  override readonly endContractJson = endContract;

  override get operations() {
    return [
      this.createTable({
        table: 'OwnershipOffer',
        columns: [
          col('createdAt', 'TEXT', { notNull: true, codecRef: { codecId: 'sqlite/text@1' } }),
          col('fromUserId', 'TEXT', { notNull: true, codecRef: { codecId: 'sqlite/text@1' } }),
          col('id', 'TEXT', { notNull: true, codecRef: { codecId: 'sqlite/text@1' } }),
          col('orgId', 'TEXT', { notNull: true, codecRef: { codecId: 'sqlite/text@1' } }),
          col('status', 'TEXT', { notNull: true, codecRef: { codecId: 'sqlite/text@1' } }),
          col('stepDown', 'INTEGER', { notNull: true, codecRef: { codecId: 'sqlite/integer@1' } }),
          col('toUserId', 'TEXT', { notNull: true, codecRef: { codecId: 'sqlite/text@1' } }),
        ],
        constraints: [primaryKey(['id'])],
      }),
    ];
  }
}

MigrationCLI.run(import.meta.url, M);
