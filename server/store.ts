/**
 * @file The data store: one cached {@link DataSnapshot} for reads, serialized transactional
 * writes for changes.
 *
 * - `read(fn)` runs `fn` against the cached snapshot (loaded through Prisma on first use).
 * - `write(fn)` takes a lock, gives `fn` a deep copy (a *draft*) to change, writes the
 *   difference through Prisma in ONE transaction, and only then swaps the draft in as the new
 *   cache. If `fn` throws (a rule or permission failure) or the transaction fails, nothing is
 *   written and the cache is untouched, so the database and the cache can never disagree.
 *
 * Writes are queued one at a time. For a single-laptop deployment this is simpler and safer
 * than row locking, and every write finishes in a few milliseconds.
 */
import type { DataSnapshot } from '@shared/domain/snapshot';
import type { Db } from './prisma/db';
import { loadSnapshot, persistChanges } from './repositories/snapshotRepository';

/** Cached, transactional access to Onboard's data. */
export class Store {
  private snapshot: DataSnapshot | null = null;
  private queue: Promise<unknown> = Promise.resolve();

  /**
   * @param db - Prisma client the store reads and writes through.
   */
  constructor(readonly db: Db) {}

  /**
   * Returns the cached snapshot, loading it from the database the first time.
   * @returns The current snapshot. Treat it as read-only.
   */
  async current(): Promise<DataSnapshot> {
    this.snapshot ??= await loadSnapshot(this.db);
    return this.snapshot;
  }

  /** Forgets the cache so the next read reloads from the database (after a reset). */
  invalidate(): void {
    this.snapshot = null;
  }

  /**
   * Runs a read-only handler.
   * @param fn - Handler; must not mutate the snapshot.
   * @returns The handler's result.
   */
  async read<T>(fn: (data: DataSnapshot) => T | Promise<T>): Promise<T> {
    // Wait for in-flight writes so a read never sees a half-applied change.
    await this.queue.catch(() => undefined);
    return fn(await this.current());
  }

  /**
   * Runs a mutating handler on a draft and persists the result atomically.
   * @param fn - Handler that changes the draft and returns the response value.
   * @returns The handler's result (computed against the committed draft).
   */
  write<T>(fn: (draft: DataSnapshot) => T | Promise<T>): Promise<T> {
    const run = async () => {
      const base = await this.current();
      const draft = structuredClone(base);
      const result = await fn(draft);
      await this.db.transaction((tx) => persistChanges(tx, base, draft));
      this.snapshot = draft;
      return result;
    };
    return this.enqueue(run);
  }

  /**
   * Runs a bulk database operation (such as a demo reset) in the write queue, then reloads the
   * cache from the database.
   * @param fn - Operation that works on the Prisma client directly.
   * @returns The operation's result.
   */
  exclusive<T>(fn: (db: Db) => Promise<T>): Promise<T> {
    return this.enqueue(async () => {
      try {
        return await fn(this.db);
      } finally {
        this.invalidate();
      }
    });
  }

  /**
   * Appends a task to the single write queue.
   * @param task - Task to run once earlier writes finish.
   * @returns The task's result.
   */
  private enqueue<T>(task: () => Promise<T>): Promise<T> {
    const next = this.queue.then(task, task);
    this.queue = next.catch(() => undefined);
    return next;
  }
}
