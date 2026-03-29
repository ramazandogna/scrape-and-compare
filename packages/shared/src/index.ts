/**
 * @scrape/shared — Barrel Export
 *
 * Bu dosya paketin "kapısı". Dışarıdan yapılan tüm import'lar buraya gelir.
 * Kullanım: import { JobListing, jobListingSchema, SCRAPER_DEFAULTS } from '@scrape/shared';
 *
 * Neden barrel? Paket içi dosya yapısını dışarıya sızdırmamak için.
 * İç yapı değişse bile dış import'lar aynı kalır (SRP, encapsulation).
 */

// Types
export type {
  ExtractedSkill,
  SalaryParsed,
  JobListing,
  ScrapeQuery,
  ScrapeOutput,
  ScraperConfig,
  SalaryCurrency,
  SalaryPeriod,
  JobSource,
  ScraperStatus,
  ScraperErrorLegacy,
  ScraperError,
  ParserError,
  MatcherError,
  ScraperResult,
  ParserResult,
  MatcherResult,
  ScrapeJobData,
  ScrapeJobCompleted,
  ScrapeJobFailed,
  ScrapeJobResult,
  ScrapeJobProgress,
} from './types/index';

// Schemas
export {
  extractedSkillSchema,
  salaryParsedSchema,
  jobListingSchema,
  llmSkillExtractionSchema,
  type LlmSkillExtraction,
} from './schemas/index';

// Constants
export {
  EXCHANGE_RATES,
  SCRAPER_DEFAULTS,
  VALID_SCRAPER_TRANSITIONS,
  QUEUE_NAMES,
} from './constants/index';
