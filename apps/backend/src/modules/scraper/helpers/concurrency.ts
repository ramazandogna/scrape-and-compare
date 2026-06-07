/**
 * Concurrency Queue — controlled parallel task executor.
 *
 * Problem:
 *   We want to search 5 keywords on LinkedIn. Doing them sequentially is slow (100s);
 *   doing them all at once is dangerous (rate limiting → ban). Solution: bounded parallelism.
 *
 * How it works (semaphore pattern):
 *   - "concurrency" slots are available (e.g. 2)
 *   - Each task consumes a slot
 *   - If all slots are busy, new tasks wait
 *   - When a task finishes the slot frees up, a waiting task starts
 *
 *   concurrency=2, tasks=[A,B,C,D,E]:
 *     t=0  → [A starts] [B starts] [C waits] [D waits] [E waits]
 *     t=3  → A done → [C starts]
 *     t=5  → B done → [D starts]
 *     t=7  → C done → [E starts]
 *     t=10 → D done
 *     t=12 → E done → finished ✅
 *
 * Discriminated Union:
 *   Each task result is either 'fulfilled' (success) or 'rejected' (error).
 *   This is the Promise.allSettled pattern — one task's failure does not stop the others.
 *
 * Usage:
 *   const results = await runConcurrent(
 *     ['react', 'angular', 'vue'],
 *     (keyword) => searchLinkedIn(keyword),
 *     { concurrency: 2, delayBetweenMs: 1000, label: 'search' }
 *   );
 */

import { sleep } from '@/utils/helpers';
import { logger } from '@/utils/logger';

// ═══════════════════════════════════════════
// TYPES — Discriminated Unions
// ═══════════════════════════════════════════

/**
 * Successful task result.
 * `item`: the input element being processed (which keyword?).
 * `data`: the return value.
 */
interface ConcurrentFulfilled<TInput, TOutput> {
  status: 'fulfilled';
  item: TInput;
  data: TOutput;
}

/**
 * Failed task result.
 * `item`: the input element that failed.
 * `error`: error message (any is forbidden → we coerce to string).
 */
interface ConcurrentRejected<TInput> {
  status: 'rejected';
  item: TInput;
  error: string;
}

/**
 * Each task result is either fulfilled or rejected — compile-time type safety.
 * Downstream `result.status === 'fulfilled'` checks → TypeScript narrows the `data` field.
 */
export type ConcurrentResult<TInput, TOutput> =
  | ConcurrentFulfilled<TInput, TOutput>
  | ConcurrentRejected<TInput>;

/**
 * Queue configuration.
 */
export interface ConcurrencyOptions {
  /** Maximum tasks that may run concurrently (default: 2) */
  concurrency: number;
  /** Delay (ms) before a new task starts — rate-limit protection */
  delayBetweenMs?: number;
  /** Label shown in logs (default: 'task') */
  label?: string;
}

// ═══════════════════════════════════════════
// CORE — Semaphore-Based Queue
// ═══════════════════════════════════════════

/**
 * Runs the worker function over items with bounded parallelism.
 *
 * Semaphore pattern:
 *   - `running` counter tracks how many tasks are active
 *   - If `running < concurrency`, a new task starts
 *   - If `running === concurrency`, a new task waits on a Promise
 *   - When a task finishes, `running--` and a waiting task is released
 *
 * @param items Data to process (keywords, URLs, etc.)
 * @param worker Async function invoked for each item (item, itemIndex, slotIndex)
 * @param options Concurrency limit, delay, label
 * @returns A fulfilled or rejected result for each item
 *
 * @example
 * const results = await runConcurrent(
 *   ['react', 'vue'],
 *   async (keyword, itemIndex, slotIndex) => {
 *     const page = searchPages[slotIndex]; // each slot uses its own page
 *     return searchLinkedIn(page, keyword);
 *   },
 *   { concurrency: 2, delayBetweenMs: 500, label: 'search' }
 * );
 */
export async function runConcurrent<TInput, TOutput>(
  items: TInput[],
  worker: (item: TInput, itemIndex: number, slotIndex: number) => Promise<TOutput>,
  options: ConcurrencyOptions,
): Promise<ConcurrentResult<TInput, TOutput>[]> {
  const { concurrency, delayBetweenMs = 0, label = 'task' } = options;

  // Edge case: empty list
  if (items.length === 0) return [];

  // Effective concurrency: cannot exceed the number of items
  const effectiveConcurrency = Math.min(concurrency, items.length);

  logger.info(`[QUEUE] ${items.length} ${label} başlatılıyor`, {
    concurrency: effectiveConcurrency,
    delayBetweenMs,
  });

  const results: ConcurrentResult<TInput, TOutput>[] = [];
  let nextIndex = 0;
  let completedCount = 0;

  /**
   * A single worker slot — pulls from the queue until all items are processed.
   *
   * Each slot runs independently:
   *   Slot 0: item[0] → item[2] → item[4] → ...
   *   Slot 1: item[1] → item[3] → item[5] → ...
   *
   * When a slot frees up, it grabs the next item. This is the "work stealing" pattern.
   *
   * slotIndex: the slot's fixed index (0, 1, 2, ...).
   * In the scraper each slot has its own browser page:
   *   slot 0 → page[0], slot 1 → page[1]
   */
  async function runSlot(slotIndex: number): Promise<void> {
    while (nextIndex < items.length) {
      // Grab the next item (atomic: single-threaded, no race condition)
      const currentIndex = nextIndex;
      nextIndex++;

      const item = items[currentIndex]!;

      // Rate-limit protection — apply delay for every item except the first
      if (currentIndex > 0 && delayBetweenMs > 0) {
        await sleep(delayBetweenMs);
      }

      try {
        const data = await worker(item, currentIndex, slotIndex);
        results[currentIndex] = { status: 'fulfilled', item, data };
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        results[currentIndex] = { status: 'rejected', item, error: message };
        logger.warn(`[QUEUE] ${label} #${currentIndex} başarısız`, {
          item: typeof item === 'string' ? item : String(item),
          error: message,
        });
      }

      completedCount++;
      logger.info(`[QUEUE] ${label} ilerleme: ${completedCount}/${items.length}`);
    }
  }

  // Start N slots in parallel — each pulls items at its own pace
  const slots = Array.from({ length: effectiveConcurrency }, (_, i) => runSlot(i));
  await Promise.all(slots);

  // Summary log
  const fulfilled = results.filter((r) => r.status === 'fulfilled').length;
  const rejected = results.filter((r) => r.status === 'rejected').length;

  logger.success(`[QUEUE] ${label} tamamlandı`, {
    total: items.length,
    fulfilled,
    rejected,
    concurrency: effectiveConcurrency,
  });

  return results;
}

// ═══════════════════════════════════════════
// HELPERS
// ═══════════════════════════════════════════

/**
 * Extracts only the successful results from the queue output.
 * TypeScript narrowing: after filtering for fulfilled, the `data` field is guaranteed.
 */
export function extractFulfilled<TInput, TOutput>(
  results: ConcurrentResult<TInput, TOutput>[],
): ConcurrentFulfilled<TInput, TOutput>[] {
  return results.filter(
    (r): r is ConcurrentFulfilled<TInput, TOutput> => r.status === 'fulfilled',
  );
}

/**
 * Extracts only the failed results from the queue output.
 */
export function extractRejected<TInput, TOutput>(
  results: ConcurrentResult<TInput, TOutput>[],
): ConcurrentRejected<TInput>[] {
  return results.filter(
    (r): r is ConcurrentRejected<TInput> => r.status === 'rejected',
  );
}
