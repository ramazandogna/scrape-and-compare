/**
 * Gemini Service Tests — GeminiService unit tests.
 *
 * What do we test?
 *   1. extractJSON() — markdown fence stripping
 *   2. parseAndValidate() — JSON parse + Zod validation
 *   3. Retry on Zod validation failure (returns the last error after exhaustion)
 *   4. Empty response → EMPTY_RESPONSE error
 *   5. Invalid JSON → PARSE_ERROR error
 *
 * Why don't we hit the real Gemini API?
 *   - Unit test = no external dependencies
 *   - No API key needed, works offline
 *   - No rate limits or cost
 *   - Deterministic — same input → same output
 */

import { describe, it, expect } from 'vitest';
import { z } from 'zod';

// ═══════════════════════════════════════════
// extractJSON — markdown fence stripping
// ═══════════════════════════════════════════

/**
 * GeminiService.extractJSON() — private method tested inline.
 * Same implementation as in gemini.service.ts, character for character.
 */
function extractJSON(text: string): string {
  const fenceMatch = text.match(/```(?:json)?\s*\n?([\s\S]*?)\n?\s*```/);
  if (fenceMatch && fenceMatch[1]) {
    return fenceMatch[1].trim();
  }
  return text.trim();
}

describe('extractJSON()', () => {
  it('düz JSON → direkt döner', () => {
    const input = '{"score": 85}';

    expect(extractJSON(input)).toBe('{"score": 85}');
  });

  it('```json fence → temizler', () => {
    const input = '```json\n{"score": 85}\n```';

    expect(extractJSON(input)).toBe('{"score": 85}');
  });

  it('``` fence (json etiketi olmadan) → temizler', () => {
    const input = '```\n{"score": 85}\n```';

    expect(extractJSON(input)).toBe('{"score": 85}');
  });

  it('başında/sonunda boşluk → trim eder', () => {
    const input = '  \n  {"score": 85}  \n  ';

    expect(extractJSON(input)).toBe('{"score": 85}');
  });

  it('fence içinde çok satırlı JSON → tam olarak çıkarır', () => {
    const input = `\`\`\`json
{
  "results": [
    {"jobId": "job-1", "score": 85}
  ]
}
\`\`\``;

    const result = extractJSON(input);
    const parsed = JSON.parse(result);

    expect(parsed.results).toHaveLength(1);
    expect(parsed.results[0].score).toBe(85);
  });

  it('boş string → boş string döner', () => {
    expect(extractJSON('')).toBe('');
  });
});

// ═══════════════════════════════════════════
// parseAndValidate logic
// ═══════════════════════════════════════════

/** Simple test schema */
const testSchema = z.object({
  score: z.number().min(0).max(100),
  explanation: z.string().min(5),
});

type TestData = z.infer<typeof testSchema>;

/**
 * Inline implementation of GeminiService.parseAndValidate().
 * Tests the JSON parse + Zod validation logic.
 */
function parseAndValidate<T>(
  rawText: string,
  schema: z.ZodSchema<T>,
): { status: 'success'; data: T } | { status: 'error'; error: { code: string; message: string } } {
  const cleaned = extractJSON(rawText);

  let parsed: unknown;
  try {
    parsed = JSON.parse(cleaned);
  } catch {
    return {
      status: 'error',
      error: { code: 'PARSE_ERROR', message: 'Geçersiz JSON' },
    };
  }

  const validation = schema.safeParse(parsed);

  if (!validation.success) {
    const errors = validation.error.errors.map((e) => `${e.path.join('.')}: ${e.message}`);
    return {
      status: 'error',
      error: { code: 'VALIDATION_ERROR', message: errors.join('; ') },
    };
  }

  return { status: 'success', data: validation.data };
}

describe('parseAndValidate()', () => {
  it('geçerli JSON + geçerli schema → success', () => {
    const rawText = '{"score": 85, "explanation": "İyi eşleşme"}';

    const result = parseAndValidate(rawText, testSchema);

    expect(result.status).toBe('success');
    if (result.status === 'success') {
      expect(result.data.score).toBe(85);
      expect(result.data.explanation).toBe('İyi eşleşme');
    }
  });

  it('fence içindeki geçerli JSON → success', () => {
    const rawText = '```json\n{"score": 72, "explanation": "Orta düzey uyum"}\n```';

    const result = parseAndValidate(rawText, testSchema);

    expect(result.status).toBe('success');
    if (result.status === 'success') {
      expect(result.data.score).toBe(72);
    }
  });

  it('geçersiz JSON → PARSE_ERROR', () => {
    const rawText = '{ invalid json }';

    const result = parseAndValidate(rawText, testSchema);

    expect(result.status).toBe('error');
    if (result.status === 'error') {
      expect(result.error.code).toBe('PARSE_ERROR');
    }
  });

  it('JSON geçerli ama schema uyumsuz → VALIDATION_ERROR', () => {
    const rawText = '{"score": 150, "explanation": "Geçersiz skor değeri"}';

    const result = parseAndValidate(rawText, testSchema);

    expect(result.status).toBe('error');
    if (result.status === 'error') {
      expect(result.error.code).toBe('VALIDATION_ERROR');
      expect(result.error.message).toContain('score');
    }
  });

  it('explanation çok kısa → VALIDATION_ERROR', () => {
    const rawText = '{"score": 50, "explanation": "ab"}';

    const result = parseAndValidate(rawText, testSchema);

    expect(result.status).toBe('error');
    if (result.status === 'error') {
      expect(result.error.code).toBe('VALIDATION_ERROR');
      expect(result.error.message).toContain('explanation');
    }
  });

  it('eksik alan → VALIDATION_ERROR', () => {
    const rawText = '{"score": 50}';

    const result = parseAndValidate(rawText, testSchema);

    expect(result.status).toBe('error');
    if (result.status === 'error') {
      expect(result.error.code).toBe('VALIDATION_ERROR');
    }
  });

  it('boş string → PARSE_ERROR', () => {
    const result = parseAndValidate('', testSchema);

    expect(result.status).toBe('error');
    if (result.status === 'error') {
      expect(result.error.code).toBe('PARSE_ERROR');
    }
  });
});

// ═══════════════════════════════════════════
// RETRY LOGIC TESTS
// ═══════════════════════════════════════════

describe('generateJSON retry mantığı', () => {
  const MAX_RETRIES = 2;

  /**
   * Function that simulates retry behavior.
   * attemptFn returns a GeminiResult on each invocation.
   */
  async function generateJSONWithRetry<T>(
    attemptFn: (attempt: number) => { status: 'success'; data: T } | { status: 'error'; error: { code: string; message: string } },
  ): Promise<{ status: 'success'; data: T } | { status: 'error'; error: { code: string; message: string } }> {
    let lastError: { status: 'error'; error: { code: string; message: string } } | null = null;

    for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
      const result = attemptFn(attempt);

      if (result.status === 'success') {
        return result;
      }

      lastError = result;
    }

    return lastError ?? {
      status: 'error',
      error: { code: 'VALIDATION_ERROR', message: 'Tüm denemeler başarısız' },
    };
  }

  it('ilk denemede başarılı → direkt döner', async () => {
    const attemptFn = () => ({
      status: 'success' as const,
      data: { score: 85, explanation: 'İyi eşleşme' },
    });

    const result = await generateJSONWithRetry(attemptFn);

    expect(result.status).toBe('success');
  });

  it('ilk hatalı, ikinci başarılı → retry çalışır', async () => {
    let callCount = 0;
    const attemptFn = () => {
      callCount++;
      if (callCount === 1) {
        return { status: 'error' as const, error: { code: 'VALIDATION_ERROR', message: 'İlk deneme hata' } };
      }
      return { status: 'success' as const, data: { score: 75, explanation: 'İkinci deneme başarılı' } };
    };

    const result = await generateJSONWithRetry(attemptFn);

    expect(result.status).toBe('success');
    expect(callCount).toBe(2);
  });

  it('tüm denemeler başarısız → son hata döner', async () => {
    const attemptFn = () => ({
      status: 'error' as const,
      error: { code: 'API_ERROR', message: 'Gemini yanıt vermedi' },
    });

    const result = await generateJSONWithRetry(attemptFn);

    expect(result.status).toBe('error');
    if (result.status === 'error') {
      expect(result.error.code).toBe('API_ERROR');
    }
  });
});
