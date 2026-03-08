/**
 * Fast Scraper Entry Point — Hızlı mod ile LinkedIn'den job çeker.
 *
 * Çalıştırma: pnpm run fast
 *
 * Eski scraper vs Fast scraper:
 * - Resource blocking (JS/CSS/Image kapalı)
 * - Paralel tab pool (5 tab aynı anda)
 * - Scroll yok (SSR HTML zaten tüm veriyi içeriyor)
 * - "Show More" tıklama yok (SSR description tam)
 *
 * v1.0.0 eklentileri:
 * - .env'den keyword ve location okuma
 * - Timestamp bazlı dosya adı (job-YYYY-MM-DD-HH-MM.json)
 * - Skill extraction (main + side) ve salary parsing
 * - Adaptive delay (çok keyword = daha yavaş)
 */

import 'dotenv/config';
import { writeFileSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { fastFetchJobs, type FastScraperConfig } from '@/scraper/fast.scraper';
import type { JobListing, ScrapeOutput } from '@/models/job.model';
import { extractSkills } from '@/extractors/skill.extractor';
import { parseSalary, extractSalaryFromDescription } from '@/extractors/salary.parser';
import { logger } from '@/utils/helpers';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

/**
 * .env'den keyword listesini okur. Virgülle ayrılmış.
 * Fallback: hardcoded default keywords.
 */
const loadKeywords = (): string[] => {
  const raw = process.env['KEYWORDS'];
  if (!raw || raw.trim().length === 0) {
    return ['Frontend Developer', 'React Developer'];
  }
  return raw.split(',').map((k) => k.trim()).filter((k) => k.length > 0);
};

/**
 * .env'den location okur.
 */
const loadLocation = (): string => process.env['LOCATION']?.trim() || 'Turkey';

/**
 * .env'den + fast-specific config yükler.
 * Adaptive delay: keyword sayısı > 2 ise delay'ler 1.5x artar.
 */
const loadFastConfig = (keywordCount: number): FastScraperConfig => {
  const baseDelayMin = Number(process.env['REQUEST_DELAY_MIN'] ?? 500);
  const baseDelayMax = Number(process.env['REQUEST_DELAY_MAX'] ?? 1500);

  // Adaptive delay — çok keyword varsa LinkedIn'i daha az yorar
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

/**
 * Timestamp bazlı dosya adı üretir.
 * Format: job-YYYY-MM-DD-HH-MM.json
 */
const generateOutputFilename = (): string => {
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

/**
 * Job listesine skill extraction ve salary parsing uygular.
 *
 * @param jobs Scrape edilmiş job listesi
 * @returns Enriched job listesi
 */
const enrichJobsWithExtractors = (jobs: JobListing[]): JobListing[] =>
  jobs.map((job) => {
    const skills = extractSkills(job.title, job.description, job.requirements);
    const salaryParsed = parseSalary(job.salary) ?? extractSalaryFromDescription(job.description);

    return {
      ...job,
      skills,
      salaryParsed,
    };
  });

const main = async (): Promise<void> => {
  const keywords = loadKeywords();
  const location = loadLocation();
  const config = loadFastConfig(keywords.length);

  logger.info('⚡ FAST LinkedIn Job Scraper v1.0.0 başlatılıyor', {
    keywords,
    location,
    parallelTabs: config.parallelTabs,
    maxDetailFetch: config.maxDetailFetch,
    adaptiveDelay: keywords.length > 2 ? '1.5x' : '1x',
    resourceBlocking: true,
  });

  const startTime = Date.now();

  const { jobs, errors } = await fastFetchJobs(keywords, location, config);

  // Post-processing: skill extraction + salary parsing
  logger.info('🧠 Skill extraction ve salary parsing başlatılıyor...');
  const enrichedJobs = enrichJobsWithExtractors(jobs);

  const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);

  // Sonuçları hazırla
  const output: ScrapeOutput = {
    scrapeTimestamp: new Date().toISOString(),
    query: { keywords, location },
    totalJobs: enrichedJobs.length,
    jobs: enrichedJobs,
    errors: errors.map((e) => {
      if (e.error.status === 'error') return e.error.error;
      return { code: 'PARSING_FAILED' as const, selector: 'unknown' };
    }),
  };

  // output/ klasörüne timestamp'li dosya adıyla yaz
  const outputDir = join(__dirname, '..', 'output');
  mkdirSync(outputDir, { recursive: true });

  const filename = generateOutputFilename();
  const outputPath = join(outputDir, filename);
  writeFileSync(outputPath, JSON.stringify(output, null, 2), 'utf-8');

  // Extractor istatistikleri
  const withSkills = enrichedJobs.filter((j) => j.skills.length > 0).length;
  const withSalary = enrichedJobs.filter((j) => j.salaryParsed !== null).length;
  const totalSkills = enrichedJobs.reduce((sum, j) => sum + j.skills.length, 0);
  const mainSkills = enrichedJobs.reduce((sum, j) => sum + j.skills.filter((s) => s.isMain).length, 0);

  // Özet istatistikler
  const withDesc = enrichedJobs.filter((j) => j.description && j.description.length > 20).length;
  const withReqs = enrichedJobs.filter((j) => j.requirements.length > 0).length;

  logger.success(`\n${'═'.repeat(55)}`);
  logger.success(`⚡ FAST SCRAPE v1.0.0 TAMAMLANDI`);
  logger.success(`${'═'.repeat(55)}`);
  logger.success(`Süre: ${elapsed} saniye`);
  logger.success(`Toplam iş ilanı: ${enrichedJobs.length}`);
  logger.success(`Description çekilen: ${withDesc}`);
  logger.success(`Requirements çekilen: ${withReqs}`);
  logger.success(`Skills çıkarılan: ${withSkills} ilan (${totalSkills} toplam, ${mainSkills} main)`);
  logger.success(`Salary parse edilen: ${withSalary}`);
  logger.success(`Hatalar: ${errors.length}`);
  logger.success(`Paralel tab: ${config.parallelTabs}`);
  logger.success(`Çıktı: ${outputPath}`);
  logger.success(`${'═'.repeat(55)}`);

  // İlk 5 sonucu göster
  if (enrichedJobs.length > 0) {
    logger.info('\n📋 İlk 5 sonuç:');
    enrichedJobs.slice(0, 5).forEach((job, i) => {
      console.log(`  ${i + 1}. ${job.title} @ ${job.company} (${job.location})`);
      if (job.seniorityLevel) console.log(`     📊 Seviye: ${job.seniorityLevel}`);
      if (job.employmentType) console.log(`     💼 Tip: ${job.employmentType}`);
      if (job.skills.length > 0) {
        const mainSkillNames = job.skills.filter((s) => s.isMain).map((s) => s.name);
        const sideSkillNames = job.skills.filter((s) => !s.isMain).map((s) => s.name);
        if (mainSkillNames.length > 0) console.log(`     🎯 Ana: ${mainSkillNames.join(', ')}`);
        if (sideSkillNames.length > 0) console.log(`     📌 Yan: ${sideSkillNames.join(', ')}`);
      }
      if (job.salaryParsed) {
        const { min, max, currency, period } = job.salaryParsed;
        const range = max ? `${min?.toLocaleString('tr-TR')}-${max.toLocaleString('tr-TR')}` : `${min?.toLocaleString('tr-TR')}+`;
        console.log(`     💰 ${range} TRY/ay (${currency} ${period})`);
      }
      if (job.description) {
        console.log(`     📝 ${job.description.substring(0, 150)}...`);
      }
      if (job.requirements.length > 0) {
        console.log(`     ✅ Gereksinimler (${job.requirements.length} madde)`);
      }
      console.log(`     🔗 ${job.link}\n`);
    });
  }
};

main().catch((err) => {
  logger.error('Kritik hata — fast scraper çöktü', {
    error: err instanceof Error ? err.message : 'Unknown error',
    stack: err instanceof Error ? err.stack : undefined,
  });
  process.exit(1);
});
