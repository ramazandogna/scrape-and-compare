/**
 * Adaptive Delay Tests — error classification and backoff calculation tests.
 *
 * What do we test?
 *   1. HTTP status → does it produce the correct ScraperError code?
 *   2. Runtime error message → does it produce the correct ScraperError code?
 *   3. Backoff calculation: exponential growth, max cap, jitter
 *   4. Retry limits: CAPTCHA_DETECTED → max 1 retry
 *   5. Batch cooldown: correct interval based on error rate
 */

import { describe, it, expect } from 'vitest';
import {
  classifyHttpError,
  classifyRuntimeError,
  isRetryable,
  calculateBackoff,
  calculateBatchCooldown,
} from '@/modules/scraper/helpers/delay';

// ═══════════════════════════════════════════
// HTTP ERROR CLASSIFICATION
// ═══════════════════════════════════════════

describe('classifyHttpError', () => {
  it('429 → RATE_LIMITED döner', () => {
    const error = classifyHttpError(429, 'https://linkedin.com/jobs');
    expect(error.code).toBe('RATE_LIMITED');
  });

  it('403 → CLOUDFLARE_BLOCKED döner', () => {
    const error = classifyHttpError(403, 'https://linkedin.com/jobs');
    expect(error.code).toBe('CLOUDFLARE_BLOCKED');
  });

  it('500+ → NETWORK_ERROR döner', () => {
    const error = classifyHttpError(502, 'https://linkedin.com/jobs');
    expect(error.code).toBe('NETWORK_ERROR');
  });

  it('bilinmeyen status → NETWORK_ERROR döner', () => {
    const error = classifyHttpError(418, 'https://linkedin.com/jobs');
    expect(error.code).toBe('NETWORK_ERROR');
  });
});

// ═══════════════════════════════════════════
// RUNTIME ERROR CLASSIFICATION
// ═══════════════════════════════════════════

describe('classifyRuntimeError', () => {
  it('timeout mesajı → TIMEOUT döner', () => {
    const error = classifyRuntimeError('Navigation timeout of 30000ms exceeded');
    expect(error.code).toBe('TIMEOUT');
  });

  it('context destroyed → NETWORK_ERROR döner', () => {
    const error = classifyRuntimeError('Execution context was destroyed');
    expect(error.code).toBe('NETWORK_ERROR');
  });

  it('captcha mesajı → CAPTCHA_DETECTED döner', () => {
    const error = classifyRuntimeError('Detected unusual activity on your account');
    expect(error.code).toBe('CAPTCHA_DETECTED');
  });

  it('bilinmeyen mesaj → NETWORK_ERROR döner', () => {
    const error = classifyRuntimeError('Something weird happened');
    expect(error.code).toBe('NETWORK_ERROR');
  });
});

// ═══════════════════════════════════════════
// RETRY CHECK
// ═══════════════════════════════════════════

describe('isRetryable', () => {
  it('NETWORK_ERROR — ilk 3 deneme retry edilebilir', () => {
    const error = classifyHttpError(502, 'url');

    expect(isRetryable(error, 0)).toBe(true);
    expect(isRetryable(error, 1)).toBe(true);
    expect(isRetryable(error, 2)).toBe(true);
  });

  it('NETWORK_ERROR — 3. denemeden sonra retry edilemez', () => {
    const error = classifyHttpError(502, 'url');
    expect(isRetryable(error, 3)).toBe(false);
  });

  it('CAPTCHA_DETECTED — max 1 retry', () => {
    const error = classifyRuntimeError('unusual activity');
    expect(isRetryable(error, 0)).toBe(true);
    expect(isRetryable(error, 1)).toBe(false);
  });

  it('CLOUDFLARE_BLOCKED — max 2 retry', () => {
    const error = classifyHttpError(403, 'url');
    expect(isRetryable(error, 0)).toBe(true);
    expect(isRetryable(error, 1)).toBe(true);
    expect(isRetryable(error, 2)).toBe(false);
  });
});

// ═══════════════════════════════════════════
// BACKOFF CALCULATION
// ═══════════════════════════════════════════

describe('calculateBackoff', () => {
  it('retry arttıkça delay exponential büyür', () => {
    const error = classifyHttpError(502, 'url'); // NETWORK_ERROR, base: 2000ms

    const delay0 = calculateBackoff(error, 0);
    const delay1 = calculateBackoff(error, 1);

    // Delay must grow (jitter prevents exact equality but the trend must be correct)
    // retry 0: ~2000ms, retry 1: ~4000ms
    expect(delay0).toBeGreaterThanOrEqual(2_000);
    expect(delay1).toBeGreaterThan(delay0);
  });

  it('max delay aşılmaz', () => {
    const error = classifyHttpError(403, 'url'); // CLOUDFLARE_BLOCKED, max: 120_000ms

    // Very high retry
    const delay = calculateBackoff(error, 10);
    expect(delay).toBeLessThanOrEqual(120_000);
  });

  it('RATE_LIMITED yüksek base delay ile başlar', () => {
    const error = classifyHttpError(429, 'url');
    const delay = calculateBackoff(error, 0);

    // RATE_LIMITED base: 15_000ms
    expect(delay).toBeGreaterThanOrEqual(15_000);
  });
});

// ═══════════════════════════════════════════
// BATCH COOLDOWN
// ═══════════════════════════════════════════

describe('calculateBatchCooldown', () => {
  it('hata oranı %60 altında → cooldown yok', () => {
    expect(calculateBatchCooldown(1, 5)).toBe(0);  // 20%
    expect(calculateBatchCooldown(2, 5)).toBe(0);  // 40%
  });

  it('hata oranı %60-79 → 5-8s cooldown', () => {
    const cooldown = calculateBatchCooldown(7, 10); // 70%
    expect(cooldown).toBeGreaterThanOrEqual(5_000);
    expect(cooldown).toBeLessThanOrEqual(8_000);
  });

  it('hata oranı %80-99 → 10-15s cooldown', () => {
    const cooldown = calculateBatchCooldown(9, 10); // 90%
    expect(cooldown).toBeGreaterThanOrEqual(10_000);
    expect(cooldown).toBeLessThanOrEqual(15_000);
  });

  it('hata oranı %100 → 15-25s cooldown', () => {
    const cooldown = calculateBatchCooldown(5, 5); // 100%
    expect(cooldown).toBeGreaterThanOrEqual(15_000);
    expect(cooldown).toBeLessThanOrEqual(25_000);
  });

  it('boş batch → cooldown yok', () => {
    expect(calculateBatchCooldown(0, 0)).toBe(0);
  });
});
