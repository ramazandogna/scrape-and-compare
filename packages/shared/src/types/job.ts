/**
 * Job Listing Types — job listing data models.
 *
 * These types are used across all layers: from scraper to DB, from DB to frontend.
 * "Types ARE Documentation" principle: the type system should be enough to read the code.
 */

/**
 * Extracted skill — technology/skill extracted from the description.
 *
 * Two categories:
 * - Main: appears in title or requirements (core listing requirements)
 * - Side: appears only in description (nice-to-have or ecosystem context)
 */
export interface ExtractedSkill {
  /** Skill name (e.g. "React", "TypeScript") */
  name: string;
  /** Category (e.g. "frontend", "backend", "devops") */
  category: string;
  /** Is this a main skill? true if it appears in title/requirements */
  isMain: boolean;
}

/**
 * Parsed salary info — normalized from the raw salary string.
 * All values are converted to TRY/monthly.
 */
export interface SalaryParsed {
  /** Minimum salary (in TRY, monthly) */
  min: number | null;
  /** Maximum salary (in TRY, monthly) */
  max: number | null;
  /** Original currency */
  currency: SalaryCurrency;
  /** Original period */
  period: SalaryPeriod;
  /** Raw salary string (as-is) */
  raw: string;
}

/**
 * LinkedIn Job Listing — data model emitted by the scraper.
 *
 * This interface defines both the scraper output and the shape of the data
 * written to the DB. Some fields (salary, description) may not always be present.
 */
export interface JobListing {
  /** Unique LinkedIn job ID (parsed from URL) */
  id: string;
  /** Job title */
  title: string;
  /** Company name */
  company: string;
  /** Company logo URL extracted from LinkedIn */
  logoUrl: string | null;
  /** Location */
  location: string;
  /** Raw salary info (not always shown on LinkedIn) */
  salary: string | null;
  /** Parsed and normalized salary info */
  salaryParsed: SalaryParsed | null;
  /** Full job description */
  description: string | null;
  /** Requirements list */
  requirements: string[];
  /** Skills/technologies extracted from the description */
  skills: ExtractedSkill[];
  /** Seniority level */
  seniorityLevel: string | null;
  /** Employment type */
  employmentType: string | null;
  /** Work mode: Remote, Hybrid, On-site */
  workType: string | null;
  /** Direct listing link */
  link: string;
  /** Relative date (e.g. "2 days ago") */
  postedDate: string | null;
  /** Timestamp when scraped */
  scrapedAt: string;
}

/**
 * Scrape query — which keyword and location were searched
 */
export interface ScrapeQuery {
  keyword: string;
  location: string;
  timestamp: string;
}

/**
 * Full scrape output — format written to the JSON file
 */
export interface ScrapeOutput {
  scrapeTimestamp: string;
  query: {
    keywords: string[];
    location: string;
  };
  totalJobs: number;
  jobs: JobListing[];
  errors: ScraperErrorLegacy[];
}

/**
 * Scraper configuration — browser and rate limit settings
 */
export interface ScraperConfig {
  /** Whether the browser is visible or runs in the background */
  headless: boolean;
  /** Artificial delay between actions (ms) */
  slowMo: number;
  /** Max job listings per keyword */
  maxJobsPerKeyword: number;
  /** How many result pages to scan per keyword */
  maxSearchPages: number;
  /** Minimum wait between requests (ms) */
  requestDelayMin: number;
  /** Maximum wait between requests (ms) */
  requestDelayMax: number;
  /** Whether to fetch the detail page */
  fetchDetails: boolean;
  /** Max listings for which to fetch details */
  maxDetailFetch: number;
  /** Target new listings (successful scrape KPI) */
  targetNewJobs: number;
}

// ═══════════════════════════════════════════
// ENUMS & CONSTANTS
// ═══════════════════════════════════════════

/** Currency */
export type SalaryCurrency = 'TRY' | 'USD' | 'EUR';

/** Salary period */
export type SalaryPeriod = 'monthly' | 'yearly';

/** Job listing source */
export type JobSource = 'LINKEDIN' | 'INDEED' | 'GLASSDOOR';

/**
 * Scraper State Machine — explicit states instead of boolean flags.
 * copilot-instructions rule #11: "Use a rigid State Machine"
 */
export type ScraperStatus = 'IDLE' | 'SCANNING' | 'EXTRACTING' | 'COMPLETED' | 'FAILED';

/**
 * Legacy scraper error — kept for compatibility with the current scraper.
 * Will migrate to the ScraperError discriminated union later.
 */
export type ScraperErrorLegacy =
  | { code: 'BLOCKED'; message: string; retryAfter?: number }
  | { code: 'CAPTCHA_DETECTED'; url: string }
  | { code: 'TIMEOUT'; timeoutMs: number }
  | { code: 'PARSING_FAILED'; selector: string; html?: string }
  | { code: 'NETWORK_ERROR'; message: string }
  | { code: 'RATE_LIMITED'; resetAt: Date };
