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
  paginatedSearchScan,
} from './parsers';
export type {
  PaginatedSearchOptions,
  PaginatedSearchOutcome,
  PaginatedSearchPageEvent,
} from './parsers';

// Config, enrichment, deduplication
export {
  loadKeywords,
  loadLocation,
  loadFastConfig,
  generateOutputFilename,
  enrichJobsWithExtractors,
  filterLowQualityJobs,
  deduplicateJobs,
} from './config';
export type { FastScraperConfig } from './config';

// Adaptive backoff & error classification
export {
  classifyHttpError,
  classifyRuntimeError,
  isRetryable,
  calculateBackoff,
  calculateBatchCooldown,
  adaptiveWait,
} from './delay';

// Job mapper — scraper ↔ database field transformation
export { mapJobToCreateInput, mapJobToUpdateInput } from './job.mapper';

// Job persistence — Prisma upsert
export { upsertJobs } from './job.persistence';
export type { JobPersistResult, UpsertSummary } from './job.persistence';

// Audit logging — State Machine
export {
  createAudit,
  transitionAudit,
  updateAuditFound,
  updateAuditExtracted,
  completeAudit,
  failAudit,
} from './audit';

// Concurrency queue — kontrollü paralel task yürütücü
export { runConcurrent, extractFulfilled, extractRejected } from './concurrency';
export type { ConcurrentResult, ConcurrencyOptions } from './concurrency';
