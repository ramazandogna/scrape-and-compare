/**
 * @scrape/shared — Barrel Export
 *
 * The package entry point. All external imports go through here.
 * Usage: import { JobListing, jobListingSchema, SCRAPER_DEFAULTS } from '@scrape/shared';
 *
 * Why a barrel? To avoid leaking internal file structure to consumers.
 * Internal layout can change without breaking external imports (SRP, encapsulation).
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
