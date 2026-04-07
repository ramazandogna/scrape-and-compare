/**
 * Job Mapper — Scraper ↔ Database alan dönüşümleri.
 *
 * Neden mapper gerekli?
 * ─────────────────────
 * Scraper'dan gelen `JobListing` (shared tip) ile Prisma'nın beklediği
 * `JobListingCreateInput` arasında 3 önemli fark var:
 *
 * 1. **Alan adları:** shared → `id`, `link`, `salaryParsed`
 *                     prisma → `externalId`, `url`, `salaryMin/Max/Currency/Period`
 *
 * 2. **Enum casing:** shared → `SalaryPeriod = 'monthly' | 'yearly'` (lowercase)
 *                     prisma → `SalaryPeriod = MONTHLY | YEARLY` (uppercase enum)
 *
 * 3. **Tip yapısı:** shared → `salaryParsed: { min, max, currency, period }` (nested)
 *                    prisma → `salaryMin`, `salaryMax`, `salaryCurrency`, `salaryPeriod` (flat)
 *
 * Bu mapper bu farkları tek yerde çözer. Scraper ve DB birbirini tanımak zorunda değil.
 * Bu **Single Responsibility Principle**: mapper sadece "çevir" der.
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
// ENUM DÖNÜŞÜM TABLOLARI
// ═══════════════════════════════════════════

/**
 * shared'deki lowercase currency → Prisma enum.
 * Her iki taraf aynı casing kullandığı için doğrudan mapping.
 */
const CURRENCY_MAP: Record<string, PrismaCurrency> = {
  TRY: PrismaCurrency.TRY,
  USD: PrismaCurrency.USD,
  EUR: PrismaCurrency.EUR,
};

/**
 * shared'deki lowercase period → Prisma enum.
 *
 * DİKKAT: shared → 'monthly' / 'yearly' (lowercase)
 *         prisma → MONTHLY / YEARLY (uppercase)
 * Bu mapping olmazsa runtime'da Prisma validation hatası alırsın.
 */
const PERIOD_MAP: Record<string, PrismaPeriod> = {
  monthly: PrismaPeriod.MONTHLY,
  yearly: PrismaPeriod.YEARLY,
};

// ═══════════════════════════════════════════
// ALAN DÖNÜŞÜM HELPER'LARI
// ═══════════════════════════════════════════

/** Nested salaryParsed → flat prisma alanlarına açar */
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

/** skills array → Prisma Json tipine çevirir */
const skillsToJson = (skills: JobListing['skills']): Prisma.InputJsonValue =>
  skills as unknown as Prisma.InputJsonValue;

// ═══════════════════════════════════════════
// ANA MAPPER
// ═══════════════════════════════════════════

/**
 * Tek bir scraped JobListing'i Prisma create input'una çevirir.
 *
 * Alan mapping'i:
 *   shared.id          → prisma.externalId
 *   shared.link        → prisma.url
 *   shared.salaryParsed → prisma.salaryMin + salaryMax + salaryCurrency + salaryPeriod
 *   shared.skills      → prisma.skills (Json)
 *   shared.scrapedAt   → prisma.scrapedAt (string → Date)
 *
 * @param job Scraper'dan gelen JobListing
 * @returns Prisma'nın beklediği create input objesi
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
 * Tek bir scraped JobListing'i Prisma update input'una çevirir.
 *
 * Create ile arasındaki fark: externalId ve url güncellenmez (unique key).
 * Sadece değişebilecek alanlar (title, description, salary vb.) güncellenir.
 */
export const mapJobToUpdateInput = (
  job: JobListing,
): Prisma.JobListingUpdateInput => {
  const salary = flattenSalary(job.salaryParsed);

  return {
    title: job.title,
    company: job.company,
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
