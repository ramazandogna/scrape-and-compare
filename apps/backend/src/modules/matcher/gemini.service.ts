/**
 * GeminiService — communication layer for the Google Gemini API.
 *
 * Single responsibility: talk to Gemini, get JSON, validate with Zod.
 * This service knows "how to call" the LLM, not "what to ask".
 * Prompt logic lives in MatcherService.
 *
 * Retry strategy:
 *   - Validation/Parse error: 2 attempts, 15s wait
 *   - 429 Rate Limit: 2 attempts, 30s wait
 *   - 503 Service Unavailable: 3 attempts, 30s wait + fallback model
 *
 * Fallback Model:
 *   If the primary model (e.g. gemini-2.5-flash) returns 503,
 *   it retries with the fallback model (gemini-2.0-flash).
 */

import { Injectable } from '@nestjs/common';
import { GoogleGenerativeAI } from '@google/generative-ai';
import type { GenerativeModel } from '@google/generative-ai';
import type { ZodSchema } from 'zod';
import { logger } from '@/utils/helpers';

// ═══════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════

type GeminiResult<T> =
  | { status: 'success'; data: T }
  | { status: 'error'; error: GeminiError };

type GeminiError =
  | { code: 'API_ERROR'; message: string }
  | { code: 'PARSE_ERROR'; message: string; raw: string }
  | { code: 'VALIDATION_ERROR'; message: string; raw: string }
  | { code: 'EMPTY_RESPONSE'; message: string };

// ═══════════════════════════════════════════
// CONFIG
// ═══════════════════════════════════════════

/** How many times to retry on normal errors (validation, parse) */
const MAX_RETRIES = 2;

/** How many times to retry on 503 (model overloaded takes longer) */
const MAX_503_RETRIES = 3;

/** Standard retry wait duration (ms) */
const RETRY_DELAY_MS = 15_000;

/** Wait duration for capacity errors like 503 / 429 (ms) */
const CAPACITY_RETRY_DELAY_MS = 30_000;

/** Default overload fallback model — used for 503/429 */
const DEFAULT_OVERLOAD_FALLBACK_MODEL = 'gemini-2.5-flash-lite';

/** Default quota fallback model — used only when quota is exhausted */
const DEFAULT_QUOTA_FALLBACK_MODEL = 'gemini-3.1-flash-lite';

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Extract HTTP status type from an error message */
function detectErrorType(message: string): '503' | '429' | '429_zero_quota' | 'other' {
  if (message.includes('503')) return '503';
  if (message.includes('429')) {
    // limit: 0 / quota exceeded / RESOURCE_EXHAUSTED → model quota exhausted
    if (
      message.includes('limit: 0')
      || message.includes('RESOURCE_EXHAUSTED')
      || message.toLowerCase().includes('quota')
      || message.toLowerCase().includes('exceeded')
    ) {
      return '429_zero_quota';
    }
    return '429';
  }
  return 'other';
}

/**
 * Extract Gemini's suggested retry delay (ms) from a 429 error message.
 * Example: "retryDelay":"2s" → 2000
 * Returns the fallback duration if not found.
 */
function parseRetryDelay(message: string, fallbackMs: number): number {
  const match = message.match(/retryDelay[":]+(\d+\.?\d*)s/);
  if (match && match[1]) {
    const seconds = parseFloat(match[1]);
    // Safety: clamp to [5s, 60s] (Gemini's suggested value can be too short)
    return Math.max(5_000, Math.min(60_000, Math.ceil(seconds * 1000)));
  }
  return fallbackMs;
}

// ═══════════════════════════════════════════
// SERVICE
// ═══════════════════════════════════════════

@Injectable()
export class GeminiService {
  private readonly primaryModel: GenerativeModel;
  private readonly overloadFallbackModel: GenerativeModel | null;
  private readonly quotaFallbackModel: GenerativeModel | null;
  private readonly primaryModelName: string;
  private readonly overloadFallbackModelName: string;
  private readonly quotaFallbackModelName: string;
  private readonly primary503Retries: number;
  private readonly fallback503Retries: number;

  constructor() {
    const apiKey = process.env['GEMINI_API_KEY'];

    if (!apiKey) {
      throw new Error('GEMINI_API_KEY environment variable is required');
    }

    this.primaryModelName = process.env['GEMINI_MODEL'] ?? 'gemini-2.0-flash';
    this.overloadFallbackModelName =
      process.env['GEMINI_FALLBACK_MODEL'] ?? DEFAULT_OVERLOAD_FALLBACK_MODEL;
    this.quotaFallbackModelName =
      process.env['GEMINI_QUOTA_FALLBACK_MODEL'] ?? DEFAULT_QUOTA_FALLBACK_MODEL;
    this.primary503Retries = this.parseRetryCount(
      process.env['GEMINI_PRIMARY_503_RETRIES'],
      1,
    );
    this.fallback503Retries = this.parseRetryCount(
      process.env['GEMINI_FALLBACK_503_RETRIES'],
      MAX_503_RETRIES,
    );

    const genAI = new GoogleGenerativeAI(apiKey);
    const generationConfig = {
      responseMimeType: 'application/json' as const,
      temperature: 0.2,
    };

    this.primaryModel = genAI.getGenerativeModel({
      model: this.primaryModelName,
      generationConfig,
    });

    // Create the overload fallback model (503/429) only if it differs from the primary.
    if (this.overloadFallbackModelName !== this.primaryModelName) {
      this.overloadFallbackModel = genAI.getGenerativeModel({
        model: this.overloadFallbackModelName,
        generationConfig,
      });
    } else {
      this.overloadFallbackModel = null;
    }

    // Create the quota fallback model (429_zero_quota) only if it differs from the primary.
    if (this.quotaFallbackModelName !== this.primaryModelName) {
      this.quotaFallbackModel = genAI.getGenerativeModel({
        model: this.quotaFallbackModelName,
        generationConfig,
      });
    } else {
      this.quotaFallbackModel = null;
    }

    logger.info(
      {
        primary: this.primaryModelName,
        overloadFallback: this.overloadFallbackModel ? this.overloadFallbackModelName : 'yok',
        quotaFallback: this.quotaFallbackModel ? this.quotaFallbackModelName : 'yok',
        primary503Retries: this.primary503Retries,
        fallback503Retries: this.fallback503Retries,
      },
      '[GEMINI] Servis başlatıldı',
    );
  }

  /**
   * Send a prompt to Gemini, get a JSON response, validate with Zod.
   *
   * Strategy:
   *   1. Try the primary model (retry loop)
   *   2. On 503 → longer wait + more retries
   *   3. If the primary model fully fails + a fallback exists → try the fallback model
   */
  async generateJSON<T>(prompt: string, schema: ZodSchema<T>): Promise<GeminiResult<T>> {
    // 1. Try the primary model
    const primaryResult = await this.tryWithRetries(
      this.primaryModel,
      this.primaryModelName,
      prompt,
      schema,
      this.primary503Retries,
    );

    if (primaryResult.status === 'success') {
      return primaryResult;
    }

    // 2. If primary fails, pick the right fallback based on error type.
    if (primaryResult.error.code === 'API_ERROR') {
      const errorType = detectErrorType(primaryResult.error.message);

      // 429_zero_quota: switch only to the quota fallback model.
      if (errorType === '429_zero_quota' && this.quotaFallbackModel) {
        logger.warn(
          {
            primary: this.primaryModelName,
            fallback: this.quotaFallbackModelName,
            errorType,
            reason: 'quota_exhausted',
          },
          '[GEMINI] Birincil model kotası tükendi → quota fallback modele geçiliyor',
        );
        return this.tryWithRetries(
          this.quotaFallbackModel,
          this.quotaFallbackModelName,
          prompt,
          schema,
          this.fallback503Retries,
        );
      }

      // 503/429: capacity/rate issue → switch to the overload fallback model.
      if ((errorType === '503' || errorType === '429') && this.overloadFallbackModel) {
        logger.warn(
          {
            primary: this.primaryModelName,
            fallback: this.overloadFallbackModelName,
            errorType,
            reason: 'capacity_or_rate_limit',
          },
          '[GEMINI] Birincil model başarısız → overload fallback modele geçiliyor',
        );
        return this.tryWithRetries(
          this.overloadFallbackModel,
          this.overloadFallbackModelName,
          prompt,
          schema,
          this.fallback503Retries,
        );
      }
    }

    return primaryResult;
  }

  /**
   * Run the retry loop with a specific model.
   *
   * On 503 errors:
   *   - More retries (MAX_503_RETRIES = 3)
   *   - Longer wait (30s)
   * On other errors:
   *   - Standard retries (MAX_RETRIES = 2)
   *   - Standard wait (15s, 30s for 429)
   */
  private async tryWithRetries<T>(
    model: GenerativeModel,
    modelName: string,
    prompt: string,
    schema: ZodSchema<T>,
    max503Retries: number,
  ): Promise<GeminiResult<T>> {
    let lastError: GeminiError | null = null;
    let got503 = false;
    const maxAttempts = max503Retries;

    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      const result = await this.attemptGeneration(model, prompt, schema, attempt, modelName);

      if (result.status === 'success') {
        return result;
      }

      lastError = result.error;
      const errorType = result.error.code === 'API_ERROR' ? detectErrorType(result.error.message) : 'other';

      // 429 + limit:0 → this model's quota is zero, retry is pointless, exit immediately
      if (errorType === '429_zero_quota') {
        logger.error(
          { model: modelName, attempt },
          '[GEMINI] Model kotası 0 — retry atlanıyor (bu model API key\'de aktif değil)',
        );
        break;
      }

      if (errorType === '503') got503 = true;

      // For non-503 errors, stop at MAX_RETRIES
      if (!got503 && attempt >= MAX_RETRIES) break;

      // Last attempt → don't wait, exit
      if (attempt >= maxAttempts) break;

      // Determine wait duration
      // 429: parse the API's suggested retry duration (if any)
      // 503: fixed 30s
      const delay = errorType === '429'
        ? parseRetryDelay(result.error.message, CAPACITY_RETRY_DELAY_MS)
        : errorType === '503'
          ? CAPACITY_RETRY_DELAY_MS
          : RETRY_DELAY_MS;

      logger.warn(
        { attempt, maxAttempts: got503 ? max503Retries : MAX_RETRIES, error: result.error.code, errorType, delayMs: delay, model: modelName },
        `[GEMINI] ${String(delay / 1000)}s sonra yeniden deneniyor`,
      );
      await sleep(delay);
    }

    return {
      status: 'error',
      error: lastError ?? {
        code: 'VALIDATION_ERROR',
        message: 'Tüm denemeler başarısız',
        raw: '',
      },
    };
  }

  /**
   * Make a single Gemini call and validate the result with Zod.
   */
  private async attemptGeneration<T>(
    model: GenerativeModel,
    prompt: string,
    schema: ZodSchema<T>,
    attempt: number,
    modelName: string,
  ): Promise<GeminiResult<T>> {
    try {
      const response = await model.generateContent(prompt);
      const text = response.response.text();

      if (!text) {
        return {
          status: 'error',
          error: { code: 'EMPTY_RESPONSE', message: 'Gemini boş yanıt döndü' },
        };
      }

      return this.parseAndValidate(text, schema, attempt, modelName);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Bilinmeyen Gemini hatası';
      logger.error({ attempt, error: message, model: modelName }, '[GEMINI] API çağrısı başarısız');

      return {
        status: 'error',
        error: { code: 'API_ERROR', message },
      };
    }
  }

  /**
   * Parse the raw text response into JSON, then validate with Zod.
   */
  private parseAndValidate<T>(
    rawText: string,
    schema: ZodSchema<T>,
    attempt: number,
    modelName: string,
  ): GeminiResult<T> {
    const cleaned = this.extractJSON(rawText);

    let parsed: unknown;
    try {
      parsed = JSON.parse(cleaned);
    } catch {
      logger.warn({ attempt, raw: cleaned.slice(0, 200), model: modelName }, '[GEMINI] JSON parse hatası');
      return {
        status: 'error',
        error: { code: 'PARSE_ERROR', message: 'Geçersiz JSON', raw: cleaned.slice(0, 500) },
      };
    }

    const validation = schema.safeParse(parsed);

    if (!validation.success) {
      const errors = validation.error.errors.map((e) => `${e.path.join('.')}: ${e.message}`);
      logger.warn({ attempt, errors, model: modelName }, '[GEMINI] Zod validation hatası');
      return {
        status: 'error',
        error: {
          code: 'VALIDATION_ERROR',
          message: errors.join('; '),
          raw: JSON.stringify(parsed).slice(0, 500),
        },
      };
    }

    logger.info({ attempt, model: modelName }, '[GEMINI] Yanıt başarıyla doğrulandı');
    return { status: 'success', data: validation.data };
  }

  /**
   * Extract the JSON block from the LLM response.
   * Gemini sometimes wraps JSON in a markdown code fence — this strips it.
   */
  private extractJSON(text: string): string {
    const fenceMatch = text.match(/```(?:json)?\s*\n?([\s\S]*?)\n?\s*```/);
    if (fenceMatch && fenceMatch[1]) {
      return fenceMatch[1].trim();
    }
    return text.trim();
  }

  /**
   * Safely parse the retry-count env value.
   */
  private parseRetryCount(value: string | undefined, fallback: number): number {
    if (!value) return fallback;
    const parsed = Number.parseInt(value, 10);
    if (Number.isNaN(parsed)) return fallback;
    return Math.min(5, Math.max(1, parsed));
  }
}
