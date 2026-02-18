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
 * Beklenen performans: 40sn + 5dk → ~15-20sn total
 */

import 'dotenv/config';
import { writeFileSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { fastFetchJobs, type FastScraperConfig } from '@/scraper/fast.scraper';
import type { ScrapeOutput } from '@/models/job.model';
import { logger } from '@/utils/helpers';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

/**
 * .env'den + fast-specific config yükler.
 */
const loadFastConfig = (): FastScraperConfig => ({
  headless: process.env['HEADLESS'] !== 'false',
  slowMo: Number(process.env['SLOW_MO'] ?? 0),
  maxJobsPerKeyword: Number(process.env['MAX_JOBS_PER_KEYWORD'] ?? 25),
  requestDelayMin: Number(process.env['REQUEST_DELAY_MIN'] ?? 500),
  requestDelayMax: Number(process.env['REQUEST_DELAY_MAX'] ?? 1500),
  fetchDetails: process.env['FETCH_DETAILS'] !== 'false',
  maxDetailFetch: Number(process.env['MAX_DETAIL_FETCH'] ?? 25),
  parallelTabs: Number(process.env['PARALLEL_TABS'] ?? 5),
});

const main = async (): Promise<void> => {
  // ═══════════════════════════════════
  // 🔧 ARAMA PARAMETRELERİ
  // ═══════════════════════════════════
  const keywords = ['Frontend Developer', 'React Developer'];
  const location = 'Turkey';
  // ═══════════════════════════════════

  const config = loadFastConfig();

  logger.info('⚡ FAST LinkedIn Job Scraper başlatılıyor', {
    keywords,
    location,
    parallelTabs: config.parallelTabs,
    maxDetailFetch: config.maxDetailFetch,
    resourceBlocking: true,
  });

  const startTime = Date.now();

  const { jobs, errors } = await fastFetchJobs(keywords, location, config);

  const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);

  // Sonuçları hazırla
  const output: ScrapeOutput = {
    scrapeTimestamp: new Date().toISOString(),
    query: { keywords, location },
    totalJobs: jobs.length,
    jobs,
    errors: errors.map((e) => {
      if (e.error.status === 'error') return e.error.error;
      return { code: 'PARSING_FAILED' as const, selector: 'unknown' };
    }),
  };

  // output/ klasörüne yaz
  const outputDir = join(__dirname, '..', 'output');
  mkdirSync(outputDir, { recursive: true });

  const outputPath = join(outputDir, 'jobs-fast.json');
  writeFileSync(outputPath, JSON.stringify(output, null, 2), 'utf-8');

  // Özet istatistikler
  const withDesc = jobs.filter((j) => j.description && j.description.length > 20).length;
  const withReqs = jobs.filter((j) => j.requirements.length > 0).length;

  logger.success(`\n${'═'.repeat(55)}`);
  logger.success(`⚡ FAST SCRAPE TAMAMLANDI`);
  logger.success(`${'═'.repeat(55)}`);
  logger.success(`Süre: ${elapsed} saniye`);
  logger.success(`Toplam iş ilanı: ${jobs.length}`);
  logger.success(`Description çekilen: ${withDesc}`);
  logger.success(`Requirements çekilen: ${withReqs}`);
  logger.success(`Hatalar: ${errors.length}`);
  logger.success(`Paralel tab: ${config.parallelTabs}`);
  logger.success(`Çıktı: ${outputPath}`);
  logger.success(`${'═'.repeat(55)}`);

  // İlk 5 sonucu göster
  if (jobs.length > 0) {
    logger.info('\n📋 İlk 5 sonuç:');
    jobs.slice(0, 5).forEach((job, i) => {
      console.log(`  ${i + 1}. ${job.title} @ ${job.company} (${job.location})`);
      if (job.seniorityLevel) console.log(`     📊 Seviye: ${job.seniorityLevel}`);
      if (job.employmentType) console.log(`     💼 Tip: ${job.employmentType}`);
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
