/**
 * Scraper Helpers — barrel export.
 * Tüm helper'lar bu dosya üzerinden dışarı açılır.
 */

// Resource blocking & page pool
export { enableResourceBlocking, createPagePool } from './resource';
export type { PagePool } from './resource';

// DOM parsers & batch fetch
export {
  buildSearchUrl,
  fastParseSearchPage,
  fastParseDetailPage,
  isPageBlocked,
  parallelFetchDetails,
} from './parsers';

// Config, enrichment, deduplication
export {
  loadKeywords,
  loadLocation,
  loadFastConfig,
  generateOutputFilename,
  enrichJobsWithExtractors,
  deduplicateJobs,
} from './config';
export type { FastScraperConfig } from './config';
