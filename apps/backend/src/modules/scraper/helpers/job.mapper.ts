/**
 * Job Mapper — Scraper ↔ Database field transformations.
 *
 * Why is a mapper needed?
 * ─────────────────────
 * Between the `JobListing` (shared type) coming from the scraper and the
 * `JobListingCreateInput` Prisma expects, there are 3 important differences:
 *
 * 1. **Field names:** shared → `id`, `link`, `salaryParsed`
 *                     prisma → `externalId`, `url`, `salaryMin/Max/Currency/Period`
 *
 * 2. **Enum casing:** shared → `SalaryPeriod = 'monthly' | 'yearly'` (lowercase)
 *                     prisma → `SalaryPeriod = MONTHLY | YEARLY` (uppercase enum)
 *
 * 3. **Type shape:** shared → `salaryParsed: { min, max, currency, period }` (nested)
 *                    prisma → `salaryMin`, `salaryMax`, `salaryCurrency`, `salaryPeriod` (flat)
 *
 * This mapper resolves these differences in one place. The scraper and DB do not have to know about each other.
 * This is the **Single Responsibility Principle**: the mapper only "translates".
 *
 * @module
 */

import type { Prisma } from '@scrape/database';
import {
  SalaryCurrency as PrismaCurrency,
  SalaryPeriod as PrismaPeriod,
  JobSource,
} from '@scrape/database';
import type { JobListing, SalaryParsed } from '@scrape/shared';

// ═══════════════════════════════════════════
// ENUM CONVERSION TABLES
// ═══════════════════════════════════════════

/**
 * shared lowercase currency → Prisma enum.
 * Direct mapping because both sides use the same casing.
 */
const CURRENCY_MAP: Record<string, PrismaCurrency> = {
  TRY: PrismaCurrency.TRY,
  USD: PrismaCurrency.USD,
  EUR: PrismaCurrency.EUR,
};

/**
 * shared lowercase period → Prisma enum.
 *
 * NOTE: shared → 'monthly' / 'yearly' (lowercase)
 *       prisma → MONTHLY / YEARLY (uppercase)
 * Without this mapping you would hit a Prisma validation error at runtime.
 */
const PERIOD_MAP: Record<string, PrismaPeriod> = {
  monthly: PrismaPeriod.MONTHLY,
  yearly: PrismaPeriod.YEARLY,
};

// ═══════════════════════════════════════════
// FIELD CONVERSION HELPERS
// ═══════════════════════════════════════════

/** Unflattens nested salaryParsed into flat prisma fields */
const flattenSalary = (
  parsed: SalaryParsed | null,
): Pick<
  Prisma.JobListingCreateInput,
  'salaryMin' | 'salaryMax' | 'salaryCurrency' | 'salaryPeriod'
> => {
  if (!parsed) {
    return {
      salaryMin: null,
      salaryMax: null,
      salaryCurrency: null,
      salaryPeriod: null,
    };
  }

  return {
    salaryMin: parsed.min,
    salaryMax: parsed.max,
    salaryCurrency: CURRENCY_MAP[parsed.currency] ?? null,
    salaryPeriod: PERIOD_MAP[parsed.period] ?? null,
  };
};

/** Converts a skills array to the Prisma Json type */
const skillsToJson = (skills: JobListing['skills']): Prisma.InputJsonValue =>
  skills as unknown as Prisma.InputJsonValue;

// ═══════════════════════════════════════════
// MAIN MAPPER
// ═══════════════════════════════════════════

/**
 * Converts a single scraped JobListing into a Prisma create input.
 *
 * Field mapping:
 *   shared.id          → prisma.externalId
 *   shared.link        → prisma.url
 *   shared.salaryParsed → prisma.salaryMin + salaryMax + salaryCurrency + salaryPeriod
 *   shared.skills      → prisma.skills (Json)
 *   shared.scrapedAt   → prisma.scrapedAt (string → Date)
 *
 * @param job JobListing coming from the scraper
 * @returns The create-input object Prisma expects
 */
export const mapJobToCreateInput = (
  job: JobListing,
): Prisma.JobListingCreateInput => {
  const salary = flattenSalary(job.salaryParsed);

  return {
    externalId: job.id,
    url: job.link,
    title: job.title,
    company: job.company,
    logoUrl: job.logoUrl,
    location: job.location,
    salary: job.salary,
    ...salary,
    description: job.description,
    requirements: job.requirements,
    skills: skillsToJson(job.skills),
    seniorityLevel: job.seniorityLevel,
    employmentType: job.employmentType,
    workType: job.workType,
    postedDate: job.postedDate,
    source: JobSource.LINKEDIN,
    scrapedAt: new Date(job.scrapedAt),
  };
};

/**
 * Converts a single scraped JobListing into a Prisma update input.
 *
 * Difference from create: externalId and url are not updated (unique key).
 * Only fields that may change (title, description, salary, etc.) are updated.
 */
export const mapJobToUpdateInput = (
  job: JobListing,
): Prisma.JobListingUpdateInput => {
  const salary = flattenSalary(job.salaryParsed);

  return {
    title: job.title,
    company: job.company,
    logoUrl: job.logoUrl,
    location: job.location,
    salary: job.salary,
    ...salary,
    description: job.description,
    requirements: job.requirements,
    skills: skillsToJson(job.skills),
    seniorityLevel: job.seniorityLevel,
    employmentType: job.employmentType,
    workType: job.workType,
    postedDate: job.postedDate,
    scrapedAt: new Date(job.scrapedAt),
  };
};
