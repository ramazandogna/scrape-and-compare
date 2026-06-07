/**
 * Queue Types — BullMQ queue contracts.
 *
 * These types guarantee type-safe communication between Producer (Controller/CLI)
 * and Consumer (Worker/Processor). Both sides use the same types, so "wrong field
 * sent" mistakes are caught at compile-time.
 *
 * No type is used at runtime — they only provide TypeScript compile-time safety.
 * BullMQ takes generics as `Queue<ScrapeJobData, ScrapeJobResult>`.
 */

import type { ScraperConfig } from './job';

// ═══════════════════════════════════════════
// QUEUE INPUT — what gets pushed onto the queue?
// ═══════════════════════════════════════════

/**
 * Data sent when adding a scrape job to the queue.
 *
 * Producer (Controller or CLI) uses this type to create a job.
 * Worker receives this type and starts the scraping operation.
 *
 * @example
 * await queue.add('scrape', {
 *   keywords: ['Frontend Developer', 'React Developer'],
 *   location: 'Turkey',
 * });
 */
export interface ScrapeJobData {
  /** List of keywords to search (at least 1 required) */
  keywords: string[];
  /** Search location */
  location: string;
  /** User who triggered the scrape (optional for legacy callers) */
  userId?: string;
  /** Optional config overrides — falls back to .env defaults if omitted */
  config?: Partial<ScraperConfig>;
}

// ═══════════════════════════════════════════
// QUEUE OUTPUT — what does the worker return?
// ═══════════════════════════════════════════

/**
 * Successful scrape result — returned when the worker completes the job.
 *
 * BullMQ stores this value as `job.returnvalue` in Redis.
 * Event consumers or the Controller can read it.
 */
export interface ScrapeJobCompleted {
  status: 'completed';
  /** Target number of new listings for this scrape run */
  targetNewJobs: number;
  /** Was the target reached? */
  targetReached: boolean;
  /** Explanatory note shown to the user when the target is not reached */
  discoveryMessage: string;
  /** Total job listings found */
  totalJobs: number;
  /** Listings dropped by the quality filter */
  filtered: number;
  /** Listings newly inserted into the DB */
  created: number;
  /** Listings updated in the DB */
  updated: number;
  /** Listings that failed to write to the DB */
  failed: number;
  /** Scrape duration (ms) */
  durationMs: number;
  /** ID of the related ScraperAudit record */
  auditId: string;
  /** Target new listings per keyword (smart pagination) */
  targetPerKeyword: number;
  /** Number of keywords that hit their target */
  keywordsHitTarget: number;
  /** Total keyword count */
  keywordsTotal: number;
  /** Per-keyword target vs actual report */
  perKeyword: KeywordScrapeOutcome[];
}

/**
 * Per-keyword scrape outcome summary — used in the UI to answer
 * "did you hit the target?".
 */
export interface KeywordScrapeOutcome {
  keyword: string;
  /** Unique listings collected for this keyword */
  collected: number;
  /** Target listing count */
  target: number;
  /** Pages traversed (LinkedIn pagination) */
  pagesScanned: number;
  /** Was the target reached? */
  targetReached: boolean;
  /** Did LinkedIn stop returning results for this keyword? */
  exhausted: boolean;
  /** Did we get zero results due to block/captcha/etc.? */
  blocked: boolean;
}

/**
 * Failed scrape result — returned when the worker cannot process the job.
 *
 * BullMQ stores this as `job.failedReason`.
 * `errorCode` identifies the error type, `message` provides detail.
 */
export interface ScrapeJobFailed {
  status: 'failed';
  /** Error code — one of ScraperError codes or a generic error */
  errorCode: string;
  /** Human-readable error message */
  message: string;
  /** ID of the related ScraperAudit record (if any) */
  auditId?: string;
}

/**
 * Scrape job result — Discriminated Union.
 *
 * TypeScript narrows the correct fields based on `status`:
 *
 * @example
 * if (result.status === 'completed') {
 *   console.log(result.totalJobs);  // TypeScript knows
 * } else {
 *   console.log(result.errorCode);  // TypeScript knows
 * }
 */
export type ScrapeJobResult = ScrapeJobCompleted | ScrapeJobFailed;

// ═══════════════════════════════════════════
// QUEUE PROGRESS — what is reported during processing?
// ═══════════════════════════════════════════

/**
 * Progress reported via BullMQ during a scrape.
 *
 * Worker emits this via `job.updateProgress(progress)`.
 * Frontend or event consumers can subscribe to it.
 *
 * The `phase` field stays in sync with the ScraperAudit state machine:
 *   SCANNING → search pages are being scanned
 *   EXTRACTING → skill/salary extraction is running
 */
export interface ScrapeJobProgress {
  /** Current processing phase (matches ScraperAudit state) */
  phase: 'SCANNING' | 'EXTRACTING';
  /** Human-readable status message */
  message: string;
  /** Progress percentage (0-100) */
  percentage: number;
}

// ═══════════════════════════════════════════
// MATCHER QUEUE TYPES
// ═══════════════════════════════════════════

/**
 * User profile sent to the matcher queue.
 *
 * Not the full DB User — only the fields required for scoring.
 * Token savings + privacy: fields like email, name are not sent.
 */
export interface MatcherUserProfile {
  id: string;
  techStack: string[];
  experienceYears: number;
  preferredRoles: string[];
  preferredLocations: string[];
}

/**
 * Job listing summary sent to the matcher queue.
 *
 * Full description text is not sent — skills and requirements are enough.
 * Shared between Controller (producer) and Processor (consumer).
 */
export interface MatcherJobSummary {
  id: string;
  title: string;
  company: string;
  location: string;
  skills: string[];
  requirements: string[];
  seniorityLevel: string | null;
  employmentType: string | null;
}

/**
 * Matcher job data — payload pushed to the queue.
 *
 * Controller creates it, Processor consumes it.
 * batchIndex/totalBatches are used for progress reporting.
 */
export interface MatcherJobData {
  user: MatcherUserProfile;
  jobs: MatcherJobSummary[];
  batchIndex: number;
  totalBatches: number;
}

/**
 * Matcher success result — returned when the worker completes a batch.
 */
export interface MatcherJobCompleted {
  status: 'completed';
  /** Scored listing count */
  scored: number;
  /** Failed listing count */
  failed: number;
  /** Total listings in the batch */
  totalJobs: number;
  /** Average score (0-100) */
  avgScore: number;
  /** Batch index (0-based) */
  batchIndex: number;
}

/**
 * Matcher failure result — returned when the worker cannot process a batch.
 */
export interface MatcherJobFailed {
  status: 'failed';
  errorCode: string;
  message: string;
  batchIndex: number;
}

/**
 * Matcher job result — Discriminated Union.
 */
export type MatcherJobResult = MatcherJobCompleted | MatcherJobFailed;

/**
 * Matcher progress status.
 */
export interface MatcherJobProgress {
  phase: 'SCORING' | 'SAVING';
  message: string;
  batchIndex: number;
  totalBatches: number;
  percentage: number;
}
