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
  MatcherUserProfile,
  MatcherJobSummary,
  MatcherJobData,
  MatcherJobCompleted,
  MatcherJobFailed,
  MatcherJobResult,
  MatcherJobProgress,
} from './types/index';

// Schemas
export {
  extractedSkillSchema,
  salaryParsedSchema,
  jobListingSchema,
  llmSkillExtractionSchema,
  scrapeJobDataSchema,
  scraperConfigSchema,
  jobsQuerySchema,
  singleScoringResultSchema,
  batchScoringResultSchema,
  matcherScoreInputSchema,
  createUserSchema,
  updateUserSchema,
  signupSchema,
  loginSchema,
  forgotPasswordSchema,
  resetPasswordSchema,
  type LlmSkillExtraction,
  type ScrapeJobDataInput,
  type JobsQueryInput,
  type SingleScoringResult,
  type BatchScoringResult,
  type MatcherScoreInput,
  type CreateUserInput,
  type UpdateUserInput,
  type SignupInput,
  type LoginInput,
  type ForgotPasswordInput,
  type ResetPasswordInput,
} from './schemas/index';

// Constants
export {
  EXCHANGE_RATES,
  SCRAPER_DEFAULTS,
  MATCHER_DEFAULTS,
  VALID_SCRAPER_TRANSITIONS,
  QUEUE_NAMES,
} from './constants/index';
