/**
 * Generic Result Types — Discriminated Union Pattern
 *
 * Why generic? Because 3 different modules (Scraper, Parser, Matcher) all use
 * the same "either success or error" pattern. Instead of duplicating code,
 * we define it once with a generic type.
 *
 * @example
 * // Function: returns either JobListing[] or ScraperError
 * type FetchResult = ScraperResult<JobListing[]>;
 *
 * function handleResult(result: FetchResult) {
 *   if (result.status === 'success') {
 *     // TypeScript KNOWS: result.data exists, result.error does NOT
 *     console.log(result.data);
 *   } else {
 *     // TypeScript KNOWS: result.error exists, result.data does NOT
 *     console.log(result.error.code);
 *   }
 * }
 */

import type { ScraperError, ParserError, MatcherError } from './errors';

/**
 * Scraper result type — TypeScript discriminates data vs error via `status`.
 * @typeParam T Data type returned on success
 */
export type ScraperResult<T> =
  | { status: 'success'; data: T }
  | { status: 'error'; error: ScraperError };

/**
 * Parser result type — for CV/LLM parse operations.
 * @typeParam T Data type returned on success
 */
export type ParserResult<T> =
  | { status: 'success'; data: T }
  | { status: 'error'; error: ParserError };

/**
 * Matcher result type — for job-user matching operations.
 * @typeParam T Data type returned on success
 */
export type MatcherResult<T> =
  | { status: 'success'; data: T }
  | { status: 'error'; error: MatcherError };
