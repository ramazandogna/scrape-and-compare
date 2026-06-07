/**
 * Types barrel export — exposes all types from a single entry point.
 *
 * Usage: import { JobListing, ScraperResult } from '@scrape/shared';
 * No need to import each file separately.
 */
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
} from './job';

export type {
  ScraperError,
  ParserError,
  MatcherError,
} from './errors';

export type {
  ScraperResult,
  ParserResult,
  MatcherResult,
} from './results';

export type {
  ScrapeJobData,
  ScrapeJobCompleted,
  ScrapeJobFailed,
  ScrapeJobResult,
  ScrapeJobProgress,
  KeywordScrapeOutcome,
  MatcherUserProfile,
  MatcherJobSummary,
  MatcherJobData,
  MatcherJobCompleted,
  MatcherJobFailed,
  MatcherJobResult,
  MatcherJobProgress,
} from './queue';
