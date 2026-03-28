/**
 * Adaptive Backoff — Hata tipine duyarlı akıllı bekleme stratejisi.
 *
 * Neden "adaptive"?
 * ─────────────────
 * Sabit backoff (3s → 6s) her hatayı aynı şekilde ele alır.
 * Ama LinkedIn farklı sinyaller gönderir:
 *
 *   - HTTP 429 (Rate Limited) → Uzun mola gerekir (15-30s)
 *   - HTTP 403 (Blocked)      → Çok uzun mola (30-60s), belki dur
 *   - HTTP 5xx (Server Error) → Kısa mola yeter (2-5s)
 *   - Timeout                 → Orta mola (5-10s)
 *   - Context destroyed       → Sayfa çökmüş, hızlı tekrar dene (1-3s)
 *
 * Ayrıca her retry'da bekleme süresi üstel (exponential) olarak artar
 * ve küçük bir jitter eklenir — böylece paralel tab'lar aynı anda
 * retry yapıp LinkedIn'i "burst" ile tetiklemez.
 *
 * Formül:
 *   delay = baseDelay × (2 ^ retryCount) + jitter
 *   jitter = random(0, baseDelay × 0.3)
 *
 * @module
 */

import type { ScraperError } from '@scrape/shared';
import { sleep, randomBetween, logger } from '@/utils/helpers';

// ═══════════════════════════════════════════
// ERROR SINIFLANDIRMA
// ═══════════════════════════════════════════

/** HTTP status code'dan ScraperError üretir */
export const classifyHttpError = (status: number, url: string): ScraperError => {
  if (status === 429) return { code: 'RATE_LIMITED', resetAt: new Date(Date.now() + 30_000) };
  if (status === 403) return { code: 'CLOUDFLARE_BLOCKED', retryAfter: 30_000 };
  if (status >= 500) return { code: 'NETWORK_ERROR', message: `HTTP ${status}` };
  return { code: 'NETWORK_ERROR', message: `HTTP ${status} at ${url}` };
};

/** Hata mesajından ScraperError üretir */
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
// BACKOFF HESAPLAMA
// ═══════════════════════════════════════════

/**
 * Her ScraperError tipi için temel bekleme süreleri (ms).
 *
 * Bu değerler retry=0 için geçerlidir.
 * Her retry'da 2^retryCount ile çarpılır.
 */
const BASE_DELAYS: Record<ScraperError['code'], number> = {
  RATE_LIMITED: 15_000,
  CLOUDFLARE_BLOCKED: 30_000,
  CAPTCHA_DETECTED: 60_000,
  TIMEOUT: 5_000,
  NETWORK_ERROR: 2_000,
  PARSING_FAILED: 1_000,
};

/** Her hata tipi için maksimum bekleme üst sınırı (ms) */
const MAX_DELAYS: Record<ScraperError['code'], number> = {
  RATE_LIMITED: 60_000,
  CLOUDFLARE_BLOCKED: 120_000,
  CAPTCHA_DETECTED: 120_000,
  TIMEOUT: 20_000,
  NETWORK_ERROR: 15_000,
  PARSING_FAILED: 5_000,
};

/** Her hata tipi için izin verilen maksimum retry sayısı */
const MAX_RETRIES: Record<ScraperError['code'], number> = {
  RATE_LIMITED: 3,
  CLOUDFLARE_BLOCKED: 2,
  CAPTCHA_DETECTED: 1,
  TIMEOUT: 3,
  NETWORK_ERROR: 3,
  PARSING_FAILED: 1,
};

/** Hata tipinin retry edilebilir olup olmadığını kontrol eder */
export const isRetryable = (error: ScraperError, currentRetry: number): boolean =>
  currentRetry < MAX_RETRIES[error.code];

/**
 * Adaptive backoff süresi hesaplar.
 *
 * Exponential backoff + jitter:
 *   delay = min(baseDelay × 2^retry + jitter, maxDelay)
 *
 * @param error Sınıflandırılmış ScraperError
 * @param retryCount Mevcut retry sayısı (0-indexed)
 * @returns Beklenmesi gereken süre (ms)
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
 * Batch hata oranına göre cooldown süresi hesaplar.
 *
 * Strateji:
 *   - %60-79 hatalı → 5-8s mola (uyarı seviyesi)
 *   - %80-99 hatalı → 10-15s mola (tehlike seviyesi)
 *   - %100 hatalı   → 15-25s mola (tam blok)
 *
 * @param failCount Batch'teki başarısız iş sayısı
 * @param batchSize Batch'in toplam büyüklüğü
 * @returns Cooldown süresi (ms), 0 ise cooldown gerekmez
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
 * Adaptive backoff hesaplar ve bekler — tek çağrıda retry kararı verir.
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
