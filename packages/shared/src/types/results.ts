/**
 * Generic Result Types — Discriminated Union Pattern
 *
 * Neden generic? Çünkü 3 farklı modül (Scraper, Parser, Matcher) aynı
 * "ya başarılı ya hatalı" pattern'ini kullanıyor. Kodu tekrarlamak yerine
 * generic tip ile tek seferde tanımlıyoruz.
 *
 * @example
 * // Fonksiyon: ya JobListing[] döner ya ScraperError
 * type FetchResult = ScraperResult<JobListing[]>;
 *
 * function handleResult(result: FetchResult) {
 *   if (result.status === 'success') {
 *     // TypeScript BİLİR: result.data var, result.error YOK
 *     console.log(result.data);
 *   } else {
 *     // TypeScript BİLİR: result.error var, result.data YOK
 *     console.log(result.error.code);
 *   }
 * }
 */

import type { ScraperError, ParserError, MatcherError } from './errors';

/**
 * Scraper sonuç tipi — `status` alanına göre TypeScript data veya error'u ayırt eder.
 * @typeParam T Başarılı durumda dönen veri tipi
 */
export type ScraperResult<T> =
  | { status: 'success'; data: T }
  | { status: 'error'; error: ScraperError };

/**
 * Parser sonuç tipi — CV/LLM parse işlemleri için.
 * @typeParam T Başarılı durumda dönen veri tipi
 */
export type ParserResult<T> =
  | { status: 'success'; data: T }
  | { status: 'error'; error: ParserError };

/**
 * Matcher sonuç tipi — Job-User eşleştirme işlemleri için.
 * @typeParam T Başarılı durumda dönen veri tipi
 */
export type MatcherResult<T> =
  | { status: 'success'; data: T }
  | { status: 'error'; error: MatcherError };
