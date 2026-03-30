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
import type { ZodSchema, ZodError } from 'zod';

/**
 * Zod hata mesajlarını okunabilir formata dönüştürür.
 *
 * Zod hataları nested olabilir (field.subfield). Bu helper
 * her hatayı "path: message" formatında düzleştirir.
 */
const formatZodErrors = (error: ZodError): string[] =>
  error.errors.map((e) =>
    e.path.length > 0 ? `${e.path.join('.')}: ${e.message}` : e.message,
  );

export class ZodValidationPipe implements PipeTransform {
  constructor(private readonly schema: ZodSchema) {}

  transform(value: unknown): unknown {
    const result = this.schema.safeParse(value);

    if (!result.success) {
      throw new BadRequestException({
        message: 'Validation hatası',
        errors: formatZodErrors(result.error),
      });
    }

    return result.data;
  }
}
