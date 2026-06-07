/**
 * Adaptive Backoff — error-aware smart wait strategy.
 *
 * Why "adaptive"?
 * ─────────────────
 * Fixed backoff (3s → 6s) treats every error the same.
 * But LinkedIn sends different signals:
 *
 *   - HTTP 429 (Rate Limited) → long pause required (15-30s)
 *   - HTTP 403 (Blocked)      → very long pause (30-60s), maybe stop
 *   - HTTP 5xx (Server Error) → a short pause suffices (2-5s)
 *   - Timeout                 → medium pause (5-10s)
 *   - Context destroyed       → page crashed, retry quickly (1-3s)
 *
 * The wait also grows exponentially with each retry, plus a small jitter —
 * so parallel tabs do not retry simultaneously and burst LinkedIn.
 *
 * Formula:
 *   delay = baseDelay × (2 ^ retryCount) + jitter
 *   jitter = random(0, baseDelay × 0.3)
 *
 * @module
 */

import type { ScraperError } from '@scrape/shared';
import { sleep, randomBetween, logger } from '@/utils/helpers';

// ═══════════════════════════════════════════
// ERROR CLASSIFICATION
// ═══════════════════════════════════════════

/** Produces a ScraperError from an HTTP status code */
export const classifyHttpError = (status: number, url: string): ScraperError => {
  if (status === 429) return { code: 'RATE_LIMITED', resetAt: new Date(Date.now() + 30_000) };
  if (status === 403) return { code: 'CLOUDFLARE_BLOCKED', retryAfter: 30_000 };
  if (status >= 500) return { code: 'NETWORK_ERROR', message: `HTTP ${status}` };
  return { code: 'NETWORK_ERROR', message: `HTTP ${status} at ${url}` };
};

/** Produces a ScraperError from an error message */
export const classifyRuntimeError = (message: string): ScraperError => {
  if (message.includes('Timeout') || message.includes('timeout')) {
    return { code: 'TIMEOUT', timeoutMs: 10_000 };
  }
  if (message.includes('Execution context was destroyed')) {
    return { code: 'NETWORK_ERROR', message: 'Context destroyed' };
  }
  if (message.includes('ERR_HTTP_RESPONSE_CODE_FAILURE')) {
    return { code: 'NETWORK_ERROR', message };
  }
  if (message.includes('captcha') || message.includes('unusual activity')) {
    return { code: 'CAPTCHA_DETECTED', url: '' };
  }
  return { code: 'NETWORK_ERROR', message };
};

// ═══════════════════════════════════════════
// BACKOFF CALCULATION
// ═══════════════════════════════════════════

/**
 * Base wait times (ms) per ScraperError type.
 *
 * These values apply to retry=0.
 * Each retry multiplies by 2^retryCount.
 */
const BASE_DELAYS: Record<ScraperError['code'], number> = {
  RATE_LIMITED: 15_000,
  CLOUDFLARE_BLOCKED: 30_000,
  CAPTCHA_DETECTED: 60_000,
  TIMEOUT: 5_000,
  NETWORK_ERROR: 2_000,
  PARSING_FAILED: 1_000,
};

/** Upper bound on wait time per error type (ms) */
const MAX_DELAYS: Record<ScraperError['code'], number> = {
  RATE_LIMITED: 60_000,
  CLOUDFLARE_BLOCKED: 120_000,
  CAPTCHA_DETECTED: 120_000,
  TIMEOUT: 20_000,
  NETWORK_ERROR: 15_000,
  PARSING_FAILED: 5_000,
};

/** Maximum allowed retries per error type */
const MAX_RETRIES: Record<ScraperError['code'], number> = {
  RATE_LIMITED: 3,
  CLOUDFLARE_BLOCKED: 2,
  CAPTCHA_DETECTED: 1,
  TIMEOUT: 3,
  NETWORK_ERROR: 3,
  PARSING_FAILED: 1,
};

/** Checks whether the error type is retryable */
export const isRetryable = (error: ScraperError, currentRetry: number): boolean =>
  currentRetry < MAX_RETRIES[error.code];

/**
 * Computes the adaptive backoff duration.
 *
 * Exponential backoff + jitter:
 *   delay = min(baseDelay × 2^retry + jitter, maxDelay)
 *
 * @param error Classified ScraperError
 * @param retryCount Current retry count (0-indexed)
 * @returns Duration to wait (ms)
 */
export const calculateBackoff = (error: ScraperError, retryCount: number): number => {
  const base = BASE_DELAYS[error.code];
  const max = MAX_DELAYS[error.code];
  const exponential = base * Math.pow(2, retryCount);
  const jitter = randomBetween(0, Math.round(base * 0.3));
  return Math.min(exponential + jitter, max);
};

// ═══════════════════════════════════════════
// BATCH COOLDOWN
// ═══════════════════════════════════════════

/**
 * Computes a cooldown duration based on the batch failure rate.
 *
 * Strategy:
 *   - 60-79% failures → 5-8s pause (warning level)
 *   - 80-99% failures → 10-15s pause (danger level)
 *   - 100% failures   → 15-25s pause (full block)
 *
 * @param failCount Number of failed jobs in the batch
 * @param batchSize Total size of the batch
 * @returns Cooldown duration (ms); 0 means no cooldown needed
 */
export const calculateBatchCooldown = (failCount: number, batchSize: number): number => {
  if (batchSize === 0) return 0;

  const failRate = failCount / batchSize;

  if (failRate >= 1.0) return randomBetween(15_000, 25_000);
  if (failRate >= 0.8) return randomBetween(10_000, 15_000);
  if (failRate >= 0.6) return randomBetween(5_000, 8_000);

  return 0;
};

// ═══════════════════════════════════════════
// CONVENIENCE: SLEEP WITH BACKOFF
// ═══════════════════════════════════════════

/**
 * Computes adaptive backoff and waits — single call for the retry decision.
 *
 * @returns true if retry should proceed, false if max retries exceeded
 */
export const adaptiveWait = async (
  error: ScraperError,
  retryCount: number,
  label: string,
): Promise<boolean> => {
  if (!isRetryable(error, retryCount)) return false;

  const delay = calculateBackoff(error, retryCount);
  const maxRetry = MAX_RETRIES[error.code];

  logger.warn(
    `[BACKOFF] ${label} — ${error.code} — ${delay}ms bekle (deneme ${retryCount + 1}/${maxRetry})`,
  );

  await sleep(delay);
  return true;
};
