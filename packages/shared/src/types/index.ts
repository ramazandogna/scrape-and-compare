/**
 * Types barrel export — tüm tipleri tek noktadan dışarı verir.
 *
 * Kullanım: import { JobListing, ScraperResult } from '@scrape/shared';
 * Her dosyayı ayrı ayrı import etmeye gerek yok.
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
} from './queue';
