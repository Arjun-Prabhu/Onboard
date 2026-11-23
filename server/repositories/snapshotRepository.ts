/**
 * @file Snapshot repository: loads the whole dataset through Prisma and writes back only
 * what changed (a unit of work).
 *
 * Why a snapshot? Onboard's smart features (matching, risk scoring, reports, the assistant) are
 * pure functions over all of an org's data (§2.6). The dataset of one nonprofit is small (hundreds
 * of rows), so the server keeps one in-memory copy, which makes every read a few microseconds of
 * Map lookups. Writes go through {@link persistChanges}, which compares a mutated draft with the
 * base it came from and issues the minimal `create` / `update` / `delete` calls, all inside one
 * database transaction.
 */
import type { DataSnapshot } from '@shared/domain/snapshot';
import type { Db, Tx } from '../prisma/db';
import { skillId, TABLES, type Row, type TableSpec } from './tables';

/**
 * The slice of the Prisma 8 collection API this repository uses. The models are reached by
 * name from {@link TABLES}, so a structural type stands in for each model's generated type.
 */
interface Collection {
  all(): PromiseLike<Row[]> & AsyncIterable<Row>;
  create(row: Row): Promise<unknown>;
  where(filter: Row): {
    update(row: Row): Promise<unknown>;
    delete(): Promise<unknown>;
    deleteAll(): Promise<unknown>;
    first(): Promise<Row | null>;
  };
}

/**
 * Looks up a model's collection on a client or transaction.
 * @param client - `db` or `tx`.
 * @param model - Prisma model name.
 * @returns Its collection.
 */
function collection(client: Db | Tx, model: string): Collection {
  return (client.orm as unknown as Record<string, Collection>)[model];
}

/**
 * Reads every row of a model.
 * @param client - `db` or `tx`.
 * @param model - Prisma model name.
 * @returns All rows.
 */
async function readAll(client: Db | Tx, model: string): Promise<Row[]> {
  const rows: Row[] = [];
  for await (const row of collection(client, model).all()) rows.push(row);
  return rows;
}

/** An empty dataset (the "before" side when seeding a fresh database). */
export function emptySnapshot(): DataSnapshot {
  return {
    organizations: [],
    requirements: [],
    users: [],
    memberships: [],
    profiles: [],
    orgVolunteers: [],
    sites: [],
    programs: [],
    sessions: [],
    signUps: [],
    hourLogs: [],
    equipment: [],
    presets: [],
    offers: [],
  };
}

/**
 * Loads the full dataset from SQLite into domain objects.
 * @param db - Prisma client.
 * @returns The snapshot.
 */
export async function loadSnapshot(db: Db): Promise<DataSnapshot> {
  const skillNames = new Map(
    (await readAll(db, 'Skill')).map((s) => [String(s.id), String(s.name)]),
  );
  const snapshot = emptySnapshot();
  for (const spec of TABLES) {
    const [parents, ...childSets] = await Promise.all([
      readAll(db, spec.model),
      ...spec.children.map((c) => readAll(db, c.model)),
    ]);
    // Group each child table by its parent id once: O(rows), not O(parents × children).
    const grouped = spec.children.map((c, i) => {
      const byParent = new Map<string, Row[]>();
      for (const row of childSets[i]) {
        const key = String(row[c.parentKey]);
        (byParent.get(key) ?? byParent.set(key, []).get(key))!.push(row);
      }
      return byParent;
    });
    (snapshot[spec.key] as unknown[]) = parents.map((row) => {
      const children: Record<string, Row[]> = {};
      spec.children.forEach((c, i) => (children[c.model] = grouped[i].get(String(row.id)) ?? []));
      return spec.fromRow(row, children, skillNames);
    });
  }
  return snapshot;
}

/**
 * Makes sure every skill named in an org catalog, a profile or a session has a `Skill` row.
 * @param tx - Transaction.
 * @param snapshot - Data about to be written.
 */
async function ensureSkills(tx: Tx, snapshot: DataSnapshot): Promise<void> {
  const existing = new Set((await readAll(tx, 'Skill')).map((s) => String(s.id)));
  const names = new Set<string>([
    ...snapshot.organizations.flatMap((o) => o.settings.skills),
    ...snapshot.profiles.flatMap((p) => p.skills),
    ...snapshot.sessions.flatMap((s) => s.requiredSkills),
  ]);
  for (const name of names) {
    const id = skillId(name);
    if (!existing.has(id)) {
      await collection(tx, 'Skill').create({ id, name });
      existing.add(id);
    }
  }
}

/** The changes between two versions of one collection. */
interface Diff {
  upserts: { entity: { id: string }; isNew: boolean }[];
  deletes: string[];
}

/**
 * Compares two versions of a collection by id and JSON content.
 * @param before - Base version.
 * @param after - Draft version.
 * @returns Created/changed entities and deleted ids.
 */
function diff(before: { id: string }[], after: { id: string }[]): Diff {
  const old = new Map(before.map((e) => [e.id, JSON.stringify(e)]));
  const upserts: Diff['upserts'] = [];
  for (const entity of after) {
    const prev = old.get(entity.id);
    if (prev === undefined) upserts.push({ entity, isNew: true });
    else if (prev !== JSON.stringify(entity)) upserts.push({ entity, isNew: false });
    old.delete(entity.id);
  }
  return { upserts, deletes: [...old.keys()] };
}

/**
 * Deletes an aggregate's child rows.
 * @param tx - Transaction.
 * @param spec - Aggregate spec.
 * @param id - Parent id.
 */
async function deleteChildren(tx: Tx, spec: TableSpec<{ id: string }>, id: string) {
  for (const child of [...spec.children].reverse())
    await collection(tx, child.model)
      .where({ [child.parentKey]: id })
      .deleteAll();
}

/**
 * Writes the difference between `before` and `after` to the database, inside `tx`.
 * Changed aggregates have their child rows replaced, which keeps the write logic simple and
 * is cheap at this data size.
 * @param tx - Open transaction.
 * @param before - Snapshot the draft was copied from.
 * @param after - The mutated draft.
 * @returns How many aggregates were written.
 */
export async function persistChanges(
  tx: Tx,
  before: DataSnapshot,
  after: DataSnapshot,
): Promise<number> {
  const diffs = TABLES.map((spec) => ({
    spec,
    d: diff(before[spec.key] as { id: string }[], after[spec.key] as { id: string }[]),
  }));
  if (diffs.every(({ d }) => !d.upserts.length && !d.deletes.length)) return 0;
  await ensureSkills(tx, after);

  let writes = 0;
  // Parents first, so new foreign keys always resolve.
  for (const { spec, d } of diffs) {
    for (const { entity, isNew } of d.upserts) {
      const row = spec.toRow(entity);
      if (isNew) {
        await collection(tx, spec.model).create(row);
      } else {
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        const { id, ...fields } = row;
        await collection(tx, spec.model).where({ id: entity.id }).update(fields);
        await deleteChildren(tx, spec, entity.id);
      }
      const children = spec.childRows?.(entity) ?? {};
      for (const child of spec.children)
        for (const childRow of children[child.model] ?? [])
          await collection(tx, child.model).create(childRow);
      writes++;
    }
  }
  // Children first, so nothing is left pointing at a deleted row.
  for (const { spec, d } of [...diffs].reverse()) {
    for (const id of d.deletes) {
      await deleteChildren(tx, spec, id);
      await collection(tx, spec.model).where({ id }).delete();
      writes++;
    }
  }
  return writes;
}
