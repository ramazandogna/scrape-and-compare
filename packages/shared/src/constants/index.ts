/**
 * Constants — project-wide constant values.
 *
 * Why a separate file? To avoid magic numbers.
 * Writing "DEFAULT_DELAY_MAX" instead of "3000" makes code self-documenting.
 */

/** Static exchange rates (in TRY, approx. 2025 Q1) */
export const EXCHANGE_RATES: Record<string, number> = {
  TRY: 1,
  USD: 35,
  EUR: 38,
} as const;

/** Scraper default settings */
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

/** Valid Scraper State Machine transitions */
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
 * BullMQ queue names — avoids magic strings.
 *
 * Why a constant? Instead of writing 'scraper' across 5 different files,
 * import it from one place. Zero chance of typos.
 */
export const QUEUE_NAMES = {
  SCRAPER: 'scraper',
  MATCHER: 'matcher',
} as const;

/** Matcher default settings */
export const MATCHER_DEFAULTS = {
  BATCH_SIZE: 16,
  RATE_LIMIT_RPM: 4,
  MIN_SCORE: 50,
} as const;
