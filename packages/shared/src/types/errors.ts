/**
 * Scraper Error Types — Discriminated Union Pattern
 *
 * Each error carries its own required fields. `any` is forbidden.
 * TypeScript knows at compile-time which fields are present:
 *
 * @example
 * if (error.code === 'CLOUDFLARE_BLOCKED') {
 *   // TypeScript KNOWS `retryAfter` exists here
 *   console.log(error.retryAfter);
 * }
 */
export type ScraperError =
  | { code: 'CLOUDFLARE_BLOCKED'; retryAfter: number }
  | { code: 'CAPTCHA_DETECTED'; url: string }
  | { code: 'TIMEOUT'; timeoutMs: number }
  | { code: 'PARSING_FAILED'; selector: string; html?: string }
  | { code: 'NETWORK_ERROR'; message: string }
  | { code: 'RATE_LIMITED'; resetAt: Date };

/**
 * Parser Error Types — CV/LLM parse errors
 */
export type ParserError =
  | { code: 'INVALID_CV_FORMAT'; format: string }
  | { code: 'MISSING_REQUIRED_FIELDS'; fields: string[] }
  | { code: 'LLM_PARSING_FAILED'; reason: string }
  | { code: 'VALIDATION_FAILED'; zodError: string };

/**
 * Matcher Error Types — Matching errors
 */
export type MatcherError =
  | { code: 'INVALID_USER_PROFILE'; reason: string }
  | { code: 'NO_JOBS_AVAILABLE'; count: number }
  | { code: 'SCORING_FAILED'; jobId: string };
