/**
 * Concurrency Queue — Kontrollü paralel task yürütücü.
 *
 * Problem:
 *   5 keyword'ü LinkedIn'de aramak istiyoruz. Hepsini sırayla yapmak yavaş (100sn),
 *   hepsini aynı anda yapmak tehlikeli (rate limiting → ban). Çözüm: kontrollü parallellik.
 *
 * Nasıl çalışır? (Semaphore pattern)
 *   - "concurrency" kadar slot var (örn. 2)
 *   - Her task bir slot kullanır
 *   - Slot doluysa yeni task bekler
 *   - Task bitince slot serbest kalır, bekleyen task başlar
 *
 *   concurrency=2, tasks=[A,B,C,D,E]:
 *     t=0  → [A başlar] [B başlar] [C bekler] [D bekler] [E bekler]
 *     t=3  → A biter → [C başlar]
 *     t=5  → B biter → [D başlar]
 *     t=7  → C biter → [E başlar]
 *     t=10 → D biter
 *     t=12 → E biter → tamamlandı ✅
 *
 * Discriminated Union:
 *   Her task sonucu ya 'fulfilled' (başarılı) ya 'rejected' (hatalı).
 *   Bu Promise.allSettled patternidir — bir task'ın hatası diğerlerini durdurmaz.
 *
 * Kullanım:
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
 * Başarılı task sonucu.
 * `item`: işlenen giriş elemanı (hangi keyword'dü?).
 * `data`: dönüş değeri.
 */
interface ConcurrentFulfilled<TInput, TOutput> {
  status: 'fulfilled';
  item: TInput;
  data: TOutput;
}

/**
 * Hatalı task sonucu.
 * `item`: başarısız olan giriş elemanı.
 * `error`: hata mesajı (any yasak → string'e çeviriyoruz).
 */
interface ConcurrentRejected<TInput> {
  status: 'rejected';
  item: TInput;
  error: string;
}

/**
 * Her task sonucu ya fulfilled ya rejected — compile-time type safety.
 * İleride `result.status === 'fulfilled'` check → TypeScript `data` field'ı tanır.
 */
export type ConcurrentResult<TInput, TOutput> =
  | ConcurrentFulfilled<TInput, TOutput>
  | ConcurrentRejected<TInput>;

/**
 * Queue konfigürasyonu.
 */
export interface ConcurrencyOptions {
  /** Aynı anda çalışabilecek max task sayısı (default: 2) */
  concurrency: number;
  /** Yeni task başlamadan önceki bekleme (ms) — rate limit koruması */
  delayBetweenMs?: number;
  /** Log'larda görünecek label (default: 'task') */
  label?: string;
}

// ═══════════════════════════════════════════
// CORE — Semaphore-Based Queue
// ═══════════════════════════════════════════

/**
 * Items üzerinde worker fonksiyonunu kontrollü paralel çalıştırır.
 *
 * Semaphore pattern:
 *   - `running` sayacı kaç task'ın aktif olduğunu tutar
 *   - `running < concurrency` ise yeni task başlar
 *   - `running === concurrency` ise yeni task Promise ile bekler
 *   - Task bitince `running--` ve bekleyen task serbest kalır
 *
 * @param items İşlenecek veriler (keyword'ler, URL'ler, vb.)
 * @param worker Her item için çağrılacak async fonksiyon (item, itemIndex, slotIndex)
 * @param options Concurrency limiti, delay, label
 * @returns Her item için fulfilled veya rejected sonuç
 *
 * @example
 * const results = await runConcurrent(
 *   ['react', 'vue'],
 *   async (keyword, itemIndex, slotIndex) => {
 *     const page = searchPages[slotIndex]; // her slot kendi page'ini kullanır
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

  // Edge case: boş liste
  if (items.length === 0) return [];

  // Efektif concurrency: item sayısından fazla olamaz
  const effectiveConcurrency = Math.min(concurrency, items.length);

  logger.info(`[QUEUE] ${items.length} ${label} başlatılıyor`, {
    concurrency: effectiveConcurrency,
    delayBetweenMs,
  });

  const results: ConcurrentResult<TInput, TOutput>[] = [];
  let nextIndex = 0;
  let completedCount = 0;

  /**
   * Tek bir worker slot'u — tüm item'ları bitene kadar kuyruktan çeker.
   *
   * Her slot bağımsız çalışır:
   *   Slot 0: item[0] → item[2] → item[4] → ...
   *   Slot 1: item[1] → item[3] → item[5] → ...
   *
   * Slot boşaldığında sıradaki item'ı alır. Bu "work stealing" pattern'idir.
   *
   * slotIndex: Bu slot'un sabit index'i (0, 1, 2, ...).
   * Scraper'da her slot'un kendi browser page'i vardır:
   *   slot 0 → page[0], slot 1 → page[1]
   */
  async function runSlot(slotIndex: number): Promise<void> {
    while (nextIndex < items.length) {
      // Sıradaki item'ı al (atomik: tek thread olduğu için race condition yok)
      const currentIndex = nextIndex;
      nextIndex++;

      const item = items[currentIndex]!;

      // Rate limit koruması — ilk item hariç delay uygula
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

  // N slot'u aynı anda başlat — her biri kendi hızında item çeker
  const slots = Array.from({ length: effectiveConcurrency }, (_, i) => runSlot(i));
  await Promise.all(slots);

  // Özet log
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
 * Queue sonuçlarından sadece başarılı olanları çıkarır.
 * TypeScript narrowing: fulfilled filtresi sonrası `data` field'ı garanti.
 */
export function extractFulfilled<TInput, TOutput>(
  results: ConcurrentResult<TInput, TOutput>[],
): ConcurrentFulfilled<TInput, TOutput>[] {
  return results.filter(
    (r): r is ConcurrentFulfilled<TInput, TOutput> => r.status === 'fulfilled',
  );
}

/**
 * Queue sonuçlarından sadece hatalı olanları çıkarır.
 */
export function extractRejected<TInput, TOutput>(
  results: ConcurrentResult<TInput, TOutput>[],
): ConcurrentRejected<TInput>[] {
  return results.filter(
    (r): r is ConcurrentRejected<TInput> => r.status === 'rejected',
  );
}
