/**
 * Constants — Proje genelinde kullanılan sabit değerler.
 *
 * Neden sabitler ayrı dosyada? Magic number'ları önlemek için.
 * "3000" yerine "DEFAULT_DELAY_MAX" yazmak kodu self-documenting yapar.
 */

/** Statik döviz kurları (TRY cinsinden, yaklaşık 2025 Q1) */
export const EXCHANGE_RATES: Record<string, number> = {
  TRY: 1,
  USD: 35,
  EUR: 38,
} as const;

/** Scraper varsayılan ayarları */
export const SCRAPER_DEFAULTS = {
  MAX_JOBS_PER_KEYWORD: 50,
  PARALLEL_TABS: 5,
  REQUEST_DELAY_MIN: 1000,
  REQUEST_DELAY_MAX: 3000,
  MAX_DETAIL_FETCH: 60,
  MAX_RETRIES: 2,
  COOLDOWN_MS: 8000,
  BATCH_DELAY_MIN: 2000,
  BATCH_DELAY_MAX: 4000,
  ADAPTIVE_DELAY_MULTIPLIER: 1.5,
  ADAPTIVE_DELAY_THRESHOLD: 2,
} as const;

/** Scraper State Machine geçerli geçişleri */
export const VALID_SCRAPER_TRANSITIONS: Record<string, readonly string[]> = {
  IDLE: ['SCANNING'],
  SCANNING: ['EXTRACTING', 'FAILED'],
  EXTRACTING: ['COMPLETED', 'FAILED'],
  COMPLETED: ['IDLE'],
  FAILED: ['IDLE'],
} as const;

// ═══════════════════════════════════════════
// QUEUE CONSTANTS
// ═══════════════════════════════════════════

/**
 * BullMQ kuyruk isimleri — magic string'leri önler.
 *
 * Neden sabit? 'scraper' string'ini 5 farklı dosyaya yazmak yerine
 * tek bir yerden import et. Typo yapma şansın sıfır.
 */
export const QUEUE_NAMES = {
  SCRAPER: 'scraper',
  MATCHER: 'matcher',
} as const;

/** Matcher varsayılan ayarları */
export const MATCHER_DEFAULTS = {
  BATCH_SIZE: 16,
  RATE_LIMIT_RPM: 4,
  MIN_SCORE: 50,
} as const;
