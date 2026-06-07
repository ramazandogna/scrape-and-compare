/**
 * ZodValidationPipe — Zod schema validation as a NestJS pipe.
 *
 * Usage:
 *   @UsePipes(new ZodValidationPipe(scrapeJobDataSchema))
 *   async trigger(@Body() body: ScrapeJobDataInput) { ... }
 *
 * What is a NestJS Pipe?
 *   Data arriving at a controller method passes through this pipe FIRST.
 *   If invalid it returns 400 Bad Request and the method is never called.
 *   If valid the transformed data is forwarded to the method.
 *
 * Zod + NestJS integration:
 *   1. Zod schema parses the data (validation + transformation — trim, coerce, etc.)
 *   2. On success → returns parsed data
 *   3. On failure → throws BadRequestException (with detailed error messages)
 */

import { PipeTransform, BadRequestException } from '@nestjs/common';
import type { ZodSchema, ZodError, ZodIssue } from 'zod';

/**
 * Converts Zod error messages into a readable format.
 *
 * Zod errors can be nested (field.subfield). This helper flattens each error
 * into "path: message" format.
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
      const key = Object.keys(value)[0];
      if (key !== undefined) {
        return this.tryParseJsonText(key);
      }
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

    const firstEntry = entries[0];
    if (!firstEntry) {
      return false;
    }
    const [key, entryValue] = firstEntry;
    return key.trim().startsWith('{') && typeof entryValue === 'string';
  }
}
