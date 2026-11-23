/**
 * @file Generic binary-heap priority queue (§2.6).
 *
 * Used for top-K volunteer-match ranking and waitlist ordering. A heap gives O(log n) insert and
 * pop, versus O(n log n) to fully sort, which matters when ranking every volunteer per session.
 */

/** A max-priority queue ordered by a comparator. */
export class PriorityQueue<T> {
  private readonly heap: T[] = [];

  /**
   * Creates a queue.
   * @param compare - Returns a positive number when `a` should come out BEFORE `b`.
   */
  constructor(private readonly compare: (a: T, b: T) => number) {}

  /** Number of queued items. */
  get size(): number {
    return this.heap.length;
  }

  /**
   * Adds an item.
   * @param item - The item to enqueue.
   */
  push(item: T): void {
    this.heap.push(item);
    this.siftUp(this.heap.length - 1);
  }

  /**
   * Removes and returns the highest-priority item.
   * @returns The top item, or `undefined` if empty.
   */
  pop(): T | undefined {
    if (this.heap.length === 0) return undefined;
    const top = this.heap[0];
    const last = this.heap.pop() as T;
    if (this.heap.length > 0) {
      this.heap[0] = last;
      this.siftDown(0);
    }
    return top;
  }

  /**
   * Pops up to `k` items in priority order.
   * @param k - Maximum number of items.
   * @returns The top-k items.
   */
  takeTop(k: number): T[] {
    const out: T[] = [];
    while (out.length < k && this.size > 0) out.push(this.pop() as T);
    return out;
  }

  /**
   * Restores heap order upward from an index.
   * @param index - Starting index.
   */
  private siftUp(index: number): void {
    let i = index;
    while (i > 0) {
      const parent = (i - 1) >> 1;
      if (this.compare(this.heap[i], this.heap[parent]) <= 0) break;
      [this.heap[i], this.heap[parent]] = [this.heap[parent], this.heap[i]];
      i = parent;
    }
  }

  /**
   * Restores heap order downward from an index.
   * @param index - Starting index.
   */
  private siftDown(index: number): void {
    let i = index;
    const n = this.heap.length;
    for (;;) {
      const l = 2 * i + 1;
      const r = l + 1;
      let best = i;
      if (l < n && this.compare(this.heap[l], this.heap[best]) > 0) best = l;
      if (r < n && this.compare(this.heap[r], this.heap[best]) > 0) best = r;
      if (best === i) return;
      [this.heap[i], this.heap[best]] = [this.heap[best], this.heap[i]];
      i = best;
    }
  }
}
