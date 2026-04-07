/**
 * GeminiService — Google Gemini API ile iletişim katmanı.
 *
 * Tek sorumluluk: Gemini ile konuş, JSON al, Zod ile doğrula.
 * Bu servis LLM'in "nasıl çağrılacağını" bilir, "ne sorulacağını" bilmez.
 * Prompt mantığı MatcherService'de yaşar.
 *
 * Retry stratejisi:
 *   - Validation/Parse hatası: 2 deneme, 15s bekleme
 *   - 429 Rate Limit: 2 deneme, 30s bekleme
 *   - 503 Service Unavailable: 3 deneme, 30s bekleme + fallback model
 *
 * Fallback Model:
 *   Birincil model (ör. gemini-2.5-flash) 503 verirse,
 *   fallback model (gemini-2.0-flash) ile tekrar denenir.
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

/** Normal hatalarda (validation, parse) kaç kez yeniden denenecek */
const MAX_RETRIES = 2;

/** 503 hatasında kaç kez yeniden denenecek (model overloaded daha uzun sürer) */
const MAX_503_RETRIES = 3;

/** Normal retry bekleme süresi (ms) */
const RETRY_DELAY_MS = 15_000;

/** 503 / 429 gibi kapasite hataları için bekleme süresi (ms) */
const CAPACITY_RETRY_DELAY_MS = 30_000;

/** Varsayılan fallback model — birincil model 503 verdiğinde kullanılır */
const FALLBACK_MODEL = 'gemini-2.5-flash-lite';

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Hata mesajından HTTP status tipi çıkar */
function detectErrorType(message: string): '503' | '429' | '429_zero_quota' | 'other' {
  if (message.includes('503')) return '503';
  if (message.includes('429')) {
    // limit: 0 → bu model API key'de hiç yok, retry anlamsız
    if (message.includes('limit: 0')) return '429_zero_quota';
    return '429';
  }
  return 'other';
}

/**
 * 429 hata mesajından Gemini'nin önerdiği retry süresini (ms) çıkar.
 * Örnek: "retryDelay":"2s" → 2000
 * Bulamazsa varsayılan süreyi döner.
 */
function parseRetryDelay(message: string, fallbackMs: number): number {
  const match = message.match(/retryDelay[":]+(\d+\.?\d*)s/);
  if (match && match[1]) {
    const seconds = parseFloat(match[1]);
    // Güvenlik: en az 5s, en fazla 60s (Gemini'nin söylediği bazen çok kısa)
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
  private readonly fallbackModel: GenerativeModel | null;
  private readonly primaryModelName: string;
  private readonly fallbackModelName: string;

  constructor() {
    const apiKey = process.env['GEMINI_API_KEY'];

    if (!apiKey) {
      throw new Error('GEMINI_API_KEY environment variable is required');
    }

    this.primaryModelName = process.env['GEMINI_MODEL'] ?? 'gemini-2.0-flash';
    this.fallbackModelName = process.env['GEMINI_FALLBACK_MODEL'] ?? FALLBACK_MODEL;

    const genAI = new GoogleGenerativeAI(apiKey);
    const generationConfig = {
      responseMimeType: 'application/json' as const,
      temperature: 0.2,
    };

    this.primaryModel = genAI.getGenerativeModel({
      model: this.primaryModelName,
      generationConfig,
    });

    // Fallback model sadece birincilden farklıysa oluştur
    if (this.fallbackModelName !== this.primaryModelName) {
      this.fallbackModel = genAI.getGenerativeModel({
        model: this.fallbackModelName,
        generationConfig,
      });
    } else {
      this.fallbackModel = null;
    }

    logger.info(
      { primary: this.primaryModelName, fallback: this.fallbackModel ? this.fallbackModelName : 'yok' },
      '[GEMINI] Servis başlatıldı',
    );
  }

  /**
   * Gemini'ye prompt gönder, JSON yanıt al, Zod ile doğrula.
   *
   * Strateji:
   *   1. Birincil model ile dene (retry loop)
   *   2. 503 alırsa → uzun bekleme + daha fazla retry
   *   3. Birincil model tamamen başarısızsa + fallback varsa → fallback model dene
   */
  async generateJSON<T>(prompt: string, schema: ZodSchema<T>): Promise<GeminiResult<T>> {
    // 1. Birincil model ile dene
    const primaryResult = await this.tryWithRetries(this.primaryModel, this.primaryModelName, prompt, schema);

    if (primaryResult.status === 'success') {
      return primaryResult;
    }

    // 2. Birincil başarısızsa + fallback model varsa → fallback dene
    //    503 (overloaded), 429 (rate limit), hepsi fallback'e yönlendirilir
    if (this.fallbackModel && primaryResult.error.code === 'API_ERROR') {
      const errorType = detectErrorType(primaryResult.error.message);

      // limit:0 → fallback da aynı key'le çalıştığı için farklı model, farklı kota
      // 503, 429 → birincil model müsait değil, fallback denenecek
      if (errorType === '503' || errorType === '429' || errorType === '429_zero_quota') {
        logger.warn(
          { primary: this.primaryModelName, fallback: this.fallbackModelName, errorType },
          '[GEMINI] Birincil model başarısız → fallback modele geçiliyor',
        );
        return this.tryWithRetries(this.fallbackModel, this.fallbackModelName, prompt, schema);
      }
    }

    return primaryResult;
  }

  /**
   * Belirli bir model ile retry loop çalıştırır.
   *
   * 503 hatalarında:
   *   - Daha fazla retry (MAX_503_RETRIES = 3)
   *   - Daha uzun bekleme (30s)
   * Diğer hatalarda:
   *   - Normal retry (MAX_RETRIES = 2)
   *   - Standart bekleme (15s, 429 için 30s)
   */
  private async tryWithRetries<T>(
    model: GenerativeModel,
    modelName: string,
    prompt: string,
    schema: ZodSchema<T>,
  ): Promise<GeminiResult<T>> {
    let lastError: GeminiError | null = null;
    let got503 = false;
    const maxAttempts = MAX_503_RETRIES; // en kötü ihtimale göre

    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      const result = await this.attemptGeneration(model, prompt, schema, attempt, modelName);

      if (result.status === 'success') {
        return result;
      }

      lastError = result.error;
      const errorType = result.error.code === 'API_ERROR' ? detectErrorType(result.error.message) : 'other';

      // 429 + limit:0 → bu modelin kotası sıfır, retry anlamsız, hemen çık
      if (errorType === '429_zero_quota') {
        logger.error(
          { model: modelName, attempt },
          '[GEMINI] Model kotası 0 — retry atlanıyor (bu model API key\'de aktif değil)',
        );
        break;
      }

      if (errorType === '503') got503 = true;

      // 503 olmayan hatalarda MAX_RETRIES'da kes
      if (!got503 && attempt >= MAX_RETRIES) break;

      // Son deneme → bekleme yapma, çık
      if (attempt >= maxAttempts) break;

      // Bekleme süresi belirle
      // 429: API'nin önerdiği retry süresini parse et (varsa)
      // 503: sabit 30s
      const delay = errorType === '429'
        ? parseRetryDelay(result.error.message, CAPACITY_RETRY_DELAY_MS)
        : errorType === '503'
          ? CAPACITY_RETRY_DELAY_MS
          : RETRY_DELAY_MS;

      logger.warn(
        { attempt, maxAttempts: got503 ? MAX_503_RETRIES : MAX_RETRIES, error: result.error.code, errorType, delayMs: delay, model: modelName },
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
   * Tek bir Gemini çağrısı yapar ve sonucu Zod ile doğrular.
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
   * Ham text yanıtını JSON'a parse eder, sonra Zod ile doğrular.
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
   * LLM yanıtından JSON bloğunu çıkarır.
   * Gemini bazen JSON'u markdown code fence içinde döner — bu temizler.
   */
  private extractJSON(text: string): string {
    const fenceMatch = text.match(/```(?:json)?\s*\n?([\s\S]*?)\n?\s*```/);
    if (fenceMatch && fenceMatch[1]) {
      return fenceMatch[1].trim();
    }
    return text.trim();
  }
}
