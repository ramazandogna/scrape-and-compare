/**
 * Scraper Configuration — config loading from .env and helper functions.
 *
 * ScraperConfig (from the shared package) defines the base fields.
 * FastScraperConfig extends it and adds parallelTabs.
 *
 * All config values are read from .env with safe defaults.
 * Adaptive delay: if keyword count > 2, the delay is multiplied by 1.5x.
 */

import type { JobListing, ScraperConfig } from '@scrape/shared';
import { extractSkills } from '@/extractors/skill.extractor';
import { parseSalary, extractSalaryFromDescription } from '@/extractors/salary.parser';

// ═══════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════

export interface FastScraperConfig extends ScraperConfig {
  parallelTabs: number;
  /** Number of keywords scanned concurrently during the search phase (default: 2) */
  searchConcurrency: number;
  /**
   * Target number of unique listings per keyword.
   * Since the LinkedIn guest API returns ~25 cards per page, reaching this
   * target without pagination is usually impossible.
   */
  targetPerKeyword: number;
}

// ═══════════════════════════════════════════
// CONFIG LOADERS
// ═══════════════════════════════════════════

/** Reads the keyword list from .env */
export const loadKeywords = (): string[] => {
  const raw = process.env['KEYWORDS'];
  if (!raw || raw.trim().length === 0) {
    return ['Frontend Developer', 'React Developer'];
  }
  return raw.split(',').map((k) => k.trim()).filter((k) => k.length > 0);
};

/** Reads location from .env */
export const loadLocation = (): string => process.env['LOCATION']?.trim() || 'Turkey';

/**
 * Loads the fast scraper config from .env.
 *
 * Adaptive delay logic:
 * - 1-2 keywords → normal delay
 * - 3+ keywords → 1.5x delay (LinkedIn rate-limit protection)
 *
 * @param keywordCount Number of keywords (for adaptive-delay calculation)
 * @param overrides Optional config overrides (received from the queue payload)
 *
 * Precedence: override > .env > hardcoded default.
 * This way the CLI reads from .env, while the Worker takes values from the queue payload.
 */
export const loadFastConfig = (
  keywordCount: number,
  overrides?: Partial<ScraperConfig>,
): FastScraperConfig => {
  const baseDelayMin = overrides?.requestDelayMin ?? Number(process.env['REQUEST_DELAY_MIN'] ?? 500);
  const baseDelayMax = overrides?.requestDelayMax ?? Number(process.env['REQUEST_DELAY_MAX'] ?? 1500);
  const delayMultiplier = keywordCount > 2 ? 1.5 : 1;

  // Smart-target pagination — target new listings per keyword.
  // .env: TARGET_NEW_JOBS_PER_KEYWORD (new name) or TARGET_NEW_JOBS (legacy main).
  const targetPerKeyword = overrides?.targetNewJobs
    ?? Number(process.env['TARGET_NEW_JOBS_PER_KEYWORD'] ?? process.env['TARGET_NEW_JOBS'] ?? 50);
  const maxSearchPages = overrides?.maxSearchPages
    ?? Number(process.env['MAX_SEARCH_PAGES_PER_KEYWORD'] ?? process.env['MAX_SEARCH_PAGES'] ?? 5);
  // Detail fetch scales by default to target × keyword count.
  const detailDefault = Math.max(targetPerKeyword * keywordCount, 25);

  return {
    headless: overrides?.headless ?? process.env['HEADLESS'] !== 'false',
    slowMo: overrides?.slowMo ?? Number(process.env['SLOW_MO'] ?? 0),
    // maxJobsPerKeyword is now an external contract — pagination's overall
    // collection target is determined by targetPerKeyword, but we keep this for
    // legacy deduplicateJobs callers.
    maxJobsPerKeyword: overrides?.maxJobsPerKeyword ?? Number(process.env['MAX_JOBS_PER_KEYWORD'] ?? targetPerKeyword),
    maxSearchPages,
    requestDelayMin: Math.round(baseDelayMin * delayMultiplier),
    requestDelayMax: Math.round(baseDelayMax * delayMultiplier),
    fetchDetails: overrides?.fetchDetails ?? process.env['FETCH_DETAILS'] !== 'false',
    maxDetailFetch: overrides?.maxDetailFetch ?? Number(process.env['MAX_DETAIL_FETCH'] ?? detailDefault),
    targetNewJobs: targetPerKeyword,
    parallelTabs: Number(process.env['PARALLEL_TABS'] ?? 5),
    searchConcurrency: Number(process.env['SEARCH_CONCURRENCY'] ?? 2),
    targetPerKeyword,
  };
};

// ═══════════════════════════════════════════
// OUTPUT HELPERS
// ═══════════════════════════════════════════

/** Generates a timestamp-based filename: job-YYYY-MM-DD-HH-MM.json */
export const generateOutputFilename = (): string => {
  const now = new Date();
  const pad = (n: number): string => String(n).padStart(2, '0');
  const parts = [
    now.getFullYear(),
    pad(now.getMonth() + 1),
    pad(now.getDate()),
    pad(now.getHours()),
    pad(now.getMinutes()),
  ];
  return `job-${parts.join('-')}.json`;
};

// ═══════════════════════════════════════════
// ENRICHMENT
// ═══════════════════════════════════════════

/**
 * Applies skill extraction and salary parsing to the job list.
 * Skill and salary info are extracted from each listing's description.
 */
export const enrichJobsWithExtractors = (jobs: JobListing[]): JobListing[] =>
  jobs.map((job) => {
    const skills = extractSkills(job.title, job.description, job.requirements);
    const salaryParsed = parseSalary(job.salary) ?? extractSalaryFromDescription(job.description);
    return { ...job, skills, salaryParsed };
  });

/**
 * Filters out low-quality listings.
 *
 * Rule: a listing with NO description AND no extracted main skill is worthless.
 * Such listings cannot be searched or scored by AI.
 */
export const filterLowQualityJobs = (jobs: JobListing[]): JobListing[] =>
  jobs.filter(
    (job) => job.description || job.skills.some((s) => s.isMain),
  );

// ═══════════════════════════════════════════
// DEDUPLICATION
// ═══════════════════════════════════════════

/**
 * Filters duplicate jobs — by ID and link.
 * Listings with the same externalId or the same link are discarded.
 */
export const deduplicateJobs = (
  jobs: JobListing[],
  maxPerKeyword: number,
  seenIds: Set<string>,
  seenLinks: Set<string>,
): JobListing[] =>
  jobs.slice(0, maxPerKeyword).filter((job) => {
    const isDupId = job.id.startsWith('unknown_') ? false : seenIds.has(job.id);
    const isDupLink = seenLinks.has(job.link);
    if (isDupId || isDupLink) return false;
    seenIds.add(job.id);
    seenLinks.add(job.link);
    return true;
  });
