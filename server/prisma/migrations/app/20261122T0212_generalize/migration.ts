#!/usr/bin/env -S node
import type { Contract as Start } from '../../snapshots/37b0ba3364fada2d82a09ee355a802e3fb03814d634170d848903607bde06ebb/contract';
import startContract from '../../snapshots/37b0ba3364fada2d82a09ee355a802e3fb03814d634170d848903607bde06ebb/contract.json' with { type: 'json' };
import type { Contract as End } from '../../snapshots/fbe17a2e572382583d7ebfc73b84443e88c2bc0d0f98d811b892e098801a7af1/contract';
import endContract from '../../snapshots/fbe17a2e572382583d7ebfc73b84443e88c2bc0d0f98d811b892e098801a7af1/contract.json' with { type: 'json' };
import {
  Migration,
  MigrationCLI,
  col,
  foreignKey,
  primaryKey,
  sql,
} from '@prisma/orm-sqlite/migration';

export default class M extends Migration<Start, End> {
  override readonly startContractJson = startContract;
  override readonly endContractJson = endContract;

  override get operations() {
    return [
      ...this.renameColumn({ table: 'Program', column: 'curriculum', to: 'description' }),
      ...this.renameColumn({ table: 'Program', column: 'schoolId', to: 'siteId' }),
      ...this.renameColumn({ table: 'Program', column: 'studentCount', to: 'participantCount' }),
      ...this.renameColumn({ table: 'Session', column: 'lessonTopic', to: 'title' }),
      ...this.renameColumn({ table: 'Session', column: 'mentorsNeeded', to: 'volunteersNeeded' }),
      ...this.renameTable({ table: 'Kit', to: 'Equipment' }),
      ...this.renameTable({ table: 'School', to: 'Site' }),
      ...this.renameColumn({ table: 'Equipment', column: 'model', to: 'name' }),
      ...this.renameColumn({ table: 'Site', column: 'gradeMax', to: 'rangeMax' }),
      ...this.renameColumn({ table: 'Site', column: 'gradeMin', to: 'rangeMin' }),
      ...this.renameColumn({ table: 'Site', column: 'isTitleI', to: 'priority' }),
      this.createTable({
        table: 'OrgEventRole',
        columns: [
          col('id', 'TEXT', { notNull: true, codecRef: { codecId: 'sqlite/text@1' } }),
          col('name', 'TEXT', { notNull: true, codecRef: { codecId: 'sqlite/text@1' } }),
          col('orgId', 'TEXT', { notNull: true, codecRef: { codecId: 'sqlite/text@1' } }),
          col('position', 'INTEGER', { notNull: true, codecRef: { codecId: 'sqlite/integer@1' } }),
        ],
        constraints: [primaryKey(['id']), foreignKey(['orgId'], 'Organization', ['id'])],
      }),
      this.createTable({
        table: 'OrgSkill',
        columns: [
          col('orgId', 'TEXT', { notNull: true, codecRef: { codecId: 'sqlite/text@1' } }),
          col('position', 'INTEGER', { notNull: true, codecRef: { codecId: 'sqlite/integer@1' } }),
          col('skillId', 'TEXT', { notNull: true, codecRef: { codecId: 'sqlite/text@1' } }),
        ],
        constraints: [
          primaryKey(['orgId', 'skillId']),
          foreignKey(['orgId'], 'Organization', ['id']),
          foreignKey(['skillId'], 'Skill', ['id']),
        ],
      }),
      this.createTable({
        table: 'Requirement',
        columns: [
          col('archived', 'INTEGER', { notNull: true, codecRef: { codecId: 'sqlite/integer@1' } }),
          col('description', 'TEXT', { notNull: true, codecRef: { codecId: 'sqlite/text@1' } }),
          col('id', 'TEXT', { notNull: true, codecRef: { codecId: 'sqlite/text@1' } }),
          col('name', 'TEXT', { notNull: true, codecRef: { codecId: 'sqlite/text@1' } }),
          col('orgId', 'TEXT', { notNull: true, codecRef: { codecId: 'sqlite/text@1' } }),
          col('position', 'INTEGER', { notNull: true, codecRef: { codecId: 'sqlite/integer@1' } }),
          col('validMonths', 'INTEGER', { codecRef: { codecId: 'sqlite/integer@1' } }),
        ],
        constraints: [primaryKey(['id']), foreignKey(['orgId'], 'Organization', ['id'])],
      }),
      this.createTable({
        table: 'VolunteerRequirement',
        columns: [
          col('completedAt', 'TEXT', { notNull: true, codecRef: { codecId: 'sqlite/text@1' } }),
          col('expiresAt', 'TEXT', { codecRef: { codecId: 'sqlite/text@1' } }),
          col('orgVolunteerId', 'TEXT', { notNull: true, codecRef: { codecId: 'sqlite/text@1' } }),
          col('recordedBy', 'TEXT', { notNull: true, codecRef: { codecId: 'sqlite/text@1' } }),
          col('requirementId', 'TEXT', { notNull: true, codecRef: { codecId: 'sqlite/text@1' } }),
        ],
        constraints: [
          primaryKey(['orgVolunteerId', 'requirementId']),
          foreignKey(['orgVolunteerId'], 'OrgVolunteer', ['id']),
          foreignKey(['requirementId'], 'Requirement', ['id']),
        ],
      }),
      this.createIndex({
        table: 'OrgEventRole',
        index: 'OrgEventRole_orgId_idx_c5e5aabe',
        columns: ['orgId'],
      }),
      this.createIndex({
        table: 'OrgSkill',
        index: 'OrgSkill_orgId_idx_c5e5aabe',
        columns: ['orgId'],
      }),
      this.createIndex({
        table: 'OrgSkill',
        index: 'OrgSkill_skillId_idx_6e19993d',
        columns: ['skillId'],
      }),
      this.createIndex({
        table: 'Requirement',
        index: 'Requirement_orgId_idx_c5e5aabe',
        columns: ['orgId'],
      }),
      this.createIndex({
        table: 'VolunteerRequirement',
        index: 'VolunteerRequirement_orgVolunteerId_idx_1aee60fd',
        columns: ['orgVolunteerId'],
      }),
      this.createIndex({
        table: 'VolunteerRequirement',
        index: 'VolunteerRequirement_requirementId_idx_fb134ad7',
        columns: ['requirementId'],
      }),
      this.recreateTable({
        tableName: 'Organization',
        contractTable: {
          columns: [
            {
              name: 'createdAt',
              typeSql: 'TEXT',
              codecRef: { codecId: 'sqlite/text@1' },
              nullable: false,
            },
            {
              name: 'description',
              typeSql: 'TEXT',
              codecRef: { codecId: 'sqlite/text@1' },
              nullable: false,
            },
            {
              name: 'equipmentTerm',
              typeSql: 'TEXT',
              codecRef: { codecId: 'sqlite/text@1' },
              nullable: false,
            },
            {
              name: 'featureEquipment',
              typeSql: 'INTEGER',
              codecRef: { codecId: 'sqlite/integer@1' },
              nullable: false,
            },
            {
              name: 'featureGuests',
              typeSql: 'INTEGER',
              codecRef: { codecId: 'sqlite/integer@1' },
              nullable: false,
            },
            {
              name: 'featurePriority',
              typeSql: 'INTEGER',
              codecRef: { codecId: 'sqlite/integer@1' },
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
              name: 'participantTerm',
              typeSql: 'TEXT',
              codecRef: { codecId: 'sqlite/text@1' },
              nullable: false,
            },
            {
              name: 'priorityLabel',
              typeSql: 'TEXT',
              codecRef: { codecId: 'sqlite/text@1' },
              nullable: false,
            },
            {
              name: 'rangeKind',
              typeSql: 'TEXT',
              codecRef: { codecId: 'sqlite/text@1' },
              nullable: false,
            },
            {
              name: 'sector',
              typeSql: 'TEXT',
              codecRef: { codecId: 'sqlite/text@1' },
              nullable: false,
            },
            {
              name: 'siteTerm',
              typeSql: 'TEXT',
              codecRef: { codecId: 'sqlite/text@1' },
              nullable: false,
            },
            {
              name: 'timezone',
              typeSql: 'TEXT',
              codecRef: { codecId: 'sqlite/text@1' },
              nullable: false,
            },
          ],
          primaryKey: { columns: ['id'] },
          uniques: [{ columns: ['name'] }],
          foreignKeys: [],
        },
        schemaColumnNames: ['createdAt', 'description', 'id', 'name', 'timezone'],
        indexes: [],
        summary:
          'Recreates table Organization to apply schema changes: database/Organization/column:equipmentTerm; database/Organization/column:featureEquipment; database/Organization/column:featureGuests; database/Organization/column:featurePriority; database/Organization/column:participantTerm; database/Organization/column:priorityLabel; database/Organization/column:rangeKind; database/Organization/column:sector; database/Organization/column:siteTerm',
        postchecks: [
          {
            description: 'verify "equipmentTerm" nullability on "Organization"',
            sql: `SELECT COUNT(*) > 0 FROM pragma_table_info('Organization') WHERE name = 'equipmentTerm' AND "notnull" = 1`,
          },
          {
            description: 'verify "featureEquipment" nullability on "Organization"',
            sql: `SELECT COUNT(*) > 0 FROM pragma_table_info('Organization') WHERE name = 'featureEquipment' AND "notnull" = 1`,
          },
          {
            description: 'verify "featureGuests" nullability on "Organization"',
            sql: `SELECT COUNT(*) > 0 FROM pragma_table_info('Organization') WHERE name = 'featureGuests' AND "notnull" = 1`,
          },
          {
            description: 'verify "featurePriority" nullability on "Organization"',
            sql: `SELECT COUNT(*) > 0 FROM pragma_table_info('Organization') WHERE name = 'featurePriority' AND "notnull" = 1`,
          },
          {
            description: 'verify "participantTerm" nullability on "Organization"',
            sql: `SELECT COUNT(*) > 0 FROM pragma_table_info('Organization') WHERE name = 'participantTerm' AND "notnull" = 1`,
          },
          {
            description: 'verify "priorityLabel" nullability on "Organization"',
            sql: `SELECT COUNT(*) > 0 FROM pragma_table_info('Organization') WHERE name = 'priorityLabel' AND "notnull" = 1`,
          },
          {
            description: 'verify "rangeKind" nullability on "Organization"',
            sql: `SELECT COUNT(*) > 0 FROM pragma_table_info('Organization') WHERE name = 'rangeKind' AND "notnull" = 1`,
            requiredColumn: { column: 'rangeKind', reason: 'newField' },
          },
          {
            description: 'verify "sector" nullability on "Organization"',
            sql: `SELECT COUNT(*) > 0 FROM pragma_table_info('Organization') WHERE name = 'sector' AND "notnull" = 1`,
            requiredColumn: { column: 'sector', reason: 'newField' },
          },
          {
            description: 'verify "siteTerm" nullability on "Organization"',
            sql: `SELECT COUNT(*) > 0 FROM pragma_table_info('Organization') WHERE name = 'siteTerm' AND "notnull" = 1`,
          },
        ],
        operationClass: 'additive',
        temporaryValues: {
          equipmentTerm: sql`''`,
          featureEquipment: sql`0`,
          featureGuests: sql`0`,
          featurePriority: sql`0`,
          participantTerm: sql`''`,
          priorityLabel: sql`''`,
          siteTerm: sql`''`,
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
          'siteId',
          'startDate',
          'participantCount',
          'targetRatio',
          'type',
        ],
        indexes: [{ name: 'Program_siteId_idx_cabdc5ab', columns: ['siteId'] }],
        summary:
          'Recreates table Program to apply schema changes: database/Program/column:targetRatio',
        postchecks: [
          {
            description: 'verify "targetRatio" nullability on "Program"',
            sql: `SELECT COUNT(*) > 0 FROM pragma_table_info('Program') WHERE name = 'targetRatio' AND "notnull" = 0`,
          },
        ],
        operationClass: 'widening',
      }),
      this.recreateTable({
        tableName: 'Site',
        contractTable: {
          columns: [
            {
              name: 'address',
              typeSql: 'TEXT',
              codecRef: { codecId: 'sqlite/text@1' },
              nullable: false,
            },
            {
              name: 'archived',
              typeSql: 'INTEGER',
              codecRef: { codecId: 'sqlite/integer@1' },
              nullable: false,
            },
            {
              name: 'contactEmail',
              typeSql: 'TEXT',
              codecRef: { codecId: 'sqlite/text@1' },
              nullable: false,
            },
            {
              name: 'contactName',
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
              name: 'orgId',
              typeSql: 'TEXT',
              codecRef: { codecId: 'sqlite/text@1' },
              nullable: false,
            },
            {
              name: 'priority',
              typeSql: 'INTEGER',
              codecRef: { codecId: 'sqlite/integer@1' },
              nullable: false,
            },
            {
              name: 'rangeMax',
              typeSql: 'INTEGER',
              codecRef: { codecId: 'sqlite/integer@1' },
              nullable: true,
            },
            {
              name: 'rangeMin',
              typeSql: 'INTEGER',
              codecRef: { codecId: 'sqlite/integer@1' },
              nullable: true,
            },
            {
              name: 'zip',
              typeSql: 'TEXT',
              codecRef: { codecId: 'sqlite/text@1' },
              nullable: false,
            },
          ],
          primaryKey: { columns: ['id'] },
          uniques: [{ columns: ['orgId', 'name'] }],
          foreignKeys: [
            { columns: ['orgId'], references: { table: 'Organization', columns: ['id'] } },
          ],
        },
        schemaColumnNames: [
          'address',
          'archived',
          'contactEmail',
          'contactName',
          'rangeMax',
          'rangeMin',
          'id',
          'priority',
          'name',
          'orgId',
          'zip',
        ],
        indexes: [{ name: 'Site_orgId_idx_c5e5aabe', columns: ['orgId'] }],
        summary:
          'Recreates table Site to apply schema changes: database/Site/column:rangeMax; database/Site/column:rangeMin',
        postchecks: [
          {
            description: 'verify "rangeMax" nullability on "Site"',
            sql: `SELECT COUNT(*) > 0 FROM pragma_table_info('Site') WHERE name = 'rangeMax' AND "notnull" = 0`,
          },
          {
            description: 'verify "rangeMin" nullability on "Site"',
            sql: `SELECT COUNT(*) > 0 FROM pragma_table_info('Site') WHERE name = 'rangeMin' AND "notnull" = 0`,
          },
        ],
        operationClass: 'widening',
      }),
      this.dropColumn({ table: 'OrgVolunteer', column: 'clearanceCompletedAt' }),
      this.dropColumn({ table: 'OrgVolunteer', column: 'trainingCompletedAt' }),
      this.replaceStoredValue({
        table: 'Program',
        column: 'type',
        from: 'SCHOOL_YEAR',
        to: 'ONGOING',
        codecRef: { codecId: 'sqlite/text@1' },
      }),
      this.replaceStoredValue({
        table: 'Program',
        column: 'type',
        from: 'SUMMER',
        to: 'SEASONAL',
        codecRef: { codecId: 'sqlite/text@1' },
      }),
      this.replaceStoredValue({
        table: 'Session',
        column: 'type',
        from: 'LESSON',
        to: 'SHIFT',
        codecRef: { codecId: 'sqlite/text@1' },
      }),
      this.replaceStoredValue({
        table: 'Session',
        column: 'type',
        from: 'COMPETITION',
        to: 'EVENT',
        codecRef: { codecId: 'sqlite/text@1' },
      }),
    ];
  }
}

MigrationCLI.run(import.meta.url, M);
