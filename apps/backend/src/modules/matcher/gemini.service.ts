/**
 * GeminiService — Google Gemini API ile iletişim katmanı.
 *
 * Tek sorumluluk: Gemini ile konuş, JSON al, Zod ile doğrula.
 * Bu servis LLM'in "nasıl çağrılacağını" bilir, "ne sorulacağını" bilmez.
 * Prompt mantığı MatcherService'de yaşar (4.3).
 *
 * Neden ayrı servis?
 *   - SRP: Yarın Gemini → Claude geçişinde sadece bu dosya değişir
 *   - Testability: Mock'lamak kolay — MatcherService testi Gemini'ye bağımlı değil
 *   - Retry: Zod validation hatasında otomatik yeniden deneme burada yönetilir
 *
 * Kullanım:
 *   const result = await geminiService.generateJSON(prompt, myZodSchema);
 *   // result: Zod'dan geçmiş, tip-güvenli obje
 */

import { Injectable } from '@nestjs/common';
import { GoogleGenerativeAI } from '@google/generative-ai';
import type { GenerativeModel } from '@google/generative-ai';
import type { ZodSchema } from 'zod';
import { logger } from '@/utils/helpers';

// ═══════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════

/**
 * Gemini çağrı sonucu — Discriminated Union.
 *
 * Neden union? `any` yasak. Başarı ve hata durumları ayrı tipler.
 * Çağıran kod `if (result.status === 'success')` ile güvenle erişir.
 */
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

/** Zod hatasında kaç kez yeniden denenecek */
const MAX_RETRIES = 2;

// ═══════════════════════════════════════════
// SERVICE
// ═══════════════════════════════════════════

@Injectable()
export class GeminiService {
  private readonly model: GenerativeModel;

  constructor() {
    const apiKey = process.env['GEMINI_API_KEY'];

    if (!apiKey) {
      throw new Error('GEMINI_API_KEY environment variable is required');
    }

    const modelName = process.env['GEMINI_MODEL'] ?? 'gemini-2.0-flash';
    const genAI = new GoogleGenerativeAI(apiKey);

    this.model = genAI.getGenerativeModel({
      model: modelName,
      generationConfig: {
        responseMimeType: 'application/json',
        temperature: 0.2,
      },
    });

    logger.info({ model: modelName }, '[GEMINI] Servis başlatıldı');
  }

  /**
   * Gemini'ye prompt gönder, JSON yanıt al, Zod ile doğrula.
   *
   * Akış:
   *   1. Prompt → Gemini (JSON mode)
   *   2. Ham text → JSON.parse
   *   3. JSON → Zod safeParse
   *   4. Hata varsa → retry (max 2 deneme)
   *   5. Başarılıysa → tip-güvenli obje dön
   *
   * @param prompt LLM'e gönderilecek tam prompt metni
   * @param schema Yanıtı doğrulayacak Zod şeması
   * @returns GeminiResult<T> — başarılıysa data, hatalıysa typed error
   */
  async generateJSON<T>(prompt: string, schema: ZodSchema<T>): Promise<GeminiResult<T>> {
    for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
      const result = await this.attemptGeneration(prompt, schema, attempt);

      if (result.status === 'success') {
        return result;
      }

      // Son deneme değilse devam et (retry)
      if (attempt < MAX_RETRIES) {
        logger.warn(
          { attempt, maxRetries: MAX_RETRIES, error: result.error.code },
          '[GEMINI] Yanıt doğrulanamadı, yeniden deneniyor',
        );
      }
    }

    // Tüm denemeler başarısızsa son hatayı dön
    return {
      status: 'error',
      error: {
        code: 'VALIDATION_ERROR',
        message: `${MAX_RETRIES} deneme sonrası yanıt doğrulanamadı`,
        raw: '',
      },
    };
  }

  /**
   * Tek bir Gemini çağrısı yapar ve sonucu Zod ile doğrular.
   *
   * Neden ayrı metod?
   *   generateJSON retry loop'u yönetir,
   *   attemptGeneration tek bir denemeyi yönetir.
   *   İki sorumluluk = iki fonksiyon (SRP).
   */
  private async attemptGeneration<T>(
    prompt: string,
    schema: ZodSchema<T>,
    attempt: number,
  ): Promise<GeminiResult<T>> {
    try {
      const response = await this.model.generateContent(prompt);
      const text = response.response.text();

      if (!text) {
        return {
          status: 'error',
          error: { code: 'EMPTY_RESPONSE', message: 'Gemini boş yanıt döndü' },
        };
      }

      return this.parseAndValidate(text, schema, attempt);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Bilinmeyen Gemini hatası';
      logger.error({ attempt, error: message }, '[GEMINI] API çağrısı başarısız');

      return {
        status: 'error',
        error: { code: 'API_ERROR', message },
      };
    }
  }

  /**
   * Ham text yanıtını JSON'a parse eder, sonra Zod ile doğrular.
   *
   * Gemini bazen JSON'un başına/sonuna markdown ekler:
   *   ```json\n{...}\n```
   * extractJSON() bunu temizler.
   */
  private parseAndValidate<T>(
    rawText: string,
    schema: ZodSchema<T>,
    attempt: number,
  ): GeminiResult<T> {
    const cleaned = this.extractJSON(rawText);

    let parsed: unknown;
    try {
      parsed = JSON.parse(cleaned);
    } catch {
      logger.warn({ attempt, raw: cleaned.slice(0, 200) }, '[GEMINI] JSON parse hatası');
      return {
        status: 'error',
        error: { code: 'PARSE_ERROR', message: 'Geçersiz JSON', raw: cleaned.slice(0, 500) },
      };
    }

    const validation = schema.safeParse(parsed);

    if (!validation.success) {
      const errors = validation.error.errors.map((e) => `${e.path.join('.')}: ${e.message}`);
      logger.warn({ attempt, errors }, '[GEMINI] Zod validation hatası');
      return {
        status: 'error',
        error: {
          code: 'VALIDATION_ERROR',
          message: errors.join('; '),
          raw: JSON.stringify(parsed).slice(0, 500),
        },
      };
    }

    logger.info({ attempt }, '[GEMINI] Yanıt başarıyla doğrulandı');
    return { status: 'success', data: validation.data };
  }

  /**
   * LLM yanıtından JSON bloğunu çıkarır.
   *
   * Gemini bazen JSON'u markdown code fence içinde döner:
   *   ```json\n{"score": 85}\n```
   *
   * Bu helper hem düz JSON'u hem de fence'li JSON'u temizler.
   * responseMimeType: 'application/json' genelde düz döndürür ama defensive coding.
   */
  private extractJSON(text: string): string {
    const fenceMatch = text.match(/```(?:json)?\s*\n?([\s\S]*?)\n?\s*```/);
    if (fenceMatch && fenceMatch[1]) {
      return fenceMatch[1].trim();
    }
    return text.trim();
  }
}
