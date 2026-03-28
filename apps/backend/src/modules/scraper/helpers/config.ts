/**
 * Scraper Configuration — .env'den config yükleme ve yardımcı fonksiyonlar.
 *
 * ScraperConfig (shared paketten) temel alanları tanımlar.
 * FastScraperConfig bunu extend eder ve parallelTabs ekler.
 *
 * Tüm config değerleri .env'den okunur, güvenli default'lar sağlanır.
 * Adaptive delay: keyword sayısı > 2 ise gecikme 1.5x artar.
 */

import type { JobListing, ScraperConfig } from '@scrape/shared';
import { extractSkills } from '@/extractors/skill.extractor';
import { parseSalary, extractSalaryFromDescription } from '@/extractors/salary.parser';

// ═══════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════

export interface FastScraperConfig extends ScraperConfig {
  parallelTabs: number;
}

// ═══════════════════════════════════════════
// CONFIG LOADERS
// ═══════════════════════════════════════════

/** .env'den keyword listesini okur */
export const loadKeywords = (): string[] => {
  const raw = process.env['KEYWORDS'];
  if (!raw || raw.trim().length === 0) {
    return ['Frontend Developer', 'React Developer'];
  }
  return raw.split(',').map((k) => k.trim()).filter((k) => k.length > 0);
};

/** .env'den location okur */
export const loadLocation = (): string => process.env['LOCATION']?.trim() || 'Turkey';

/**
 * .env'den fast scraper config yükler.
 *
 * Adaptive delay mantığı:
 * - 1-2 keyword → normal gecikme
 * - 3+ keyword → 1.5x gecikme (LinkedIn rate limiting koruması)
 */
export const loadFastConfig = (keywordCount: number): FastScraperConfig => {
  const baseDelayMin = Number(process.env['REQUEST_DELAY_MIN'] ?? 500);
  const baseDelayMax = Number(process.env['REQUEST_DELAY_MAX'] ?? 1500);
  const delayMultiplier = keywordCount > 2 ? 1.5 : 1;

  return {
    headless: process.env['HEADLESS'] !== 'false',
    slowMo: Number(process.env['SLOW_MO'] ?? 0),
    maxJobsPerKeyword: Number(process.env['MAX_JOBS_PER_KEYWORD'] ?? 25),
    requestDelayMin: Math.round(baseDelayMin * delayMultiplier),
    requestDelayMax: Math.round(baseDelayMax * delayMultiplier),
    fetchDetails: process.env['FETCH_DETAILS'] !== 'false',
    maxDetailFetch: Number(process.env['MAX_DETAIL_FETCH'] ?? 25),
    parallelTabs: Number(process.env['PARALLEL_TABS'] ?? 5),
  };
};

// ═══════════════════════════════════════════
// OUTPUT HELPERS
// ═══════════════════════════════════════════

/** Timestamp bazlı dosya adı üretir: job-YYYY-MM-DD-HH-MM.json */
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
 * Job listesine skill extraction ve salary parsing uygular.
 * Her iş ilanının description'ından skill ve maaş bilgisi çıkarılır.
 */
export const enrichJobsWithExtractors = (jobs: JobListing[]): JobListing[] =>
  jobs.map((job) => {
    const skills = extractSkills(job.title, job.description, job.requirements);
    const salaryParsed = parseSalary(job.salary) ?? extractSalaryFromDescription(job.description);
    return { ...job, skills, salaryParsed };
  });

// ═══════════════════════════════════════════
// DEDUPLICATION
// ═══════════════════════════════════════════

/**
 * Duplicate job'ları filtreler — ID ve link bazında.
 * Aynı externalId veya aynı link'e sahip ilanlar atılır.
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
