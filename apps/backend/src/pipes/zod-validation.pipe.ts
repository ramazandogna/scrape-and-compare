/**
 * ZodValidationPipe — NestJS pipe'ı ile Zod schema doğrulama.
 *
 * Kullanım:
 *   @UsePipes(new ZodValidationPipe(scrapeJobDataSchema))
 *   async trigger(@Body() body: ScrapeJobDataInput) { ... }
 *
 * NestJS Pipe nedir?
 *   Controller metoduna gelen veriyi ÖNCE bu pipe'dan geçirir.
 *   Veri geçerli değilse 400 Bad Request döner, metod çağrılmaz.
 *   Veri geçerliyse transform edilmiş hali metoda iletilir.
 *
 * Zod + NestJS entegrasyonu:
 *   1. Zod schema parse eder (validation + transformation — trim, coerce vb.)
 *   2. Başarılıysa → parse edilmiş veri döner
 *   3. Başarısızsa → BadRequestException fırlatılır (detaylı hata mesajları)
 */

import { PipeTransform, BadRequestException } from '@nestjs/common';
import type { ZodSchema, ZodError, ZodIssue } from 'zod';

/**
 * Zod hata mesajlarını okunabilir formata dönüştürür.
 *
 * Zod hataları nested olabilir (field.subfield). Bu helper
 * her hatayı "path: message" formatında düzleştirir.
 */
const formatZodErrors = (error: ZodError): string[] =>
  error.errors.map((e: ZodIssue) =>
    e.path.length > 0 ? `${e.path.join('.')}: ${e.message}` : e.message,
  );

export class ZodValidationPipe implements PipeTransform {
  constructor(private readonly schema: ZodSchema) {}

  transform(value: unknown): unknown {
    const normalizedValue = this.tryParseJsonString(value);
    const result = this.schema.safeParse(normalizedValue);

    if (!result.success) {
      throw new BadRequestException({
        message: 'Validation hatası',
        errors: formatZodErrors(result.error),
      });
    }

    return result.data;
  }

  private tryParseJsonString(value: unknown): unknown {
    if (Buffer.isBuffer(value)) {
      return this.tryParseJsonText(value.toString('utf8'));
    }

    if (value instanceof String) {
      return this.tryParseJsonText(value.toString());
    }

    if (typeof value === 'string') {
      return this.tryParseJsonText(value);
    }

    if (this.isUrlEncodedJsonPayload(value)) {
      return this.tryParseJsonText(Object.keys(value)[0]);
    }

    return value;
  }

  private tryParseJsonText(value: string): unknown {
    const trimmed = value.trim();

    if (!trimmed.startsWith('{') && !trimmed.startsWith('[')) {
      return value;
    }

    try {
      return JSON.parse(trimmed) as unknown;
    } catch {
      return value;
    }
  }

  private isUrlEncodedJsonPayload(
    value: unknown,
  ): value is Record<string, string> {
    if (value === null || typeof value !== 'object' || Array.isArray(value)) {
      return false;
    }

    const entries = Object.entries(value);
    if (entries.length !== 1) {
      return false;
    }

    const [[key, entryValue]] = entries;
    return key.trim().startsWith('{') && typeof entryValue === 'string';
  }
}
