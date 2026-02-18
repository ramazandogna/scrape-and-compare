/**
 * Ana giriş noktası — Scraper'ı çalıştırır ve sonuçları dosyaya yazar.
 *
 * Çalıştırma: pnpm run scrape
 * (Bu aslında `tsx src/index.ts` komutunu çalıştırır)
 *
 * Akış:
 * 1. .env'den konfigürasyon oku
 * 2. Arama parametrelerini belirle (keywords, location)
 * 3. fetchJobs() ile LinkedIn'den veri çek
 * 4. Sonuçları output/jobs.json'a yaz
 * 5. Özet bilgi göster
 */

import 'dotenv/config'; // .env dosyasını otomatik yükler
import { writeFileSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { fetchJobs } from '@/scraper/linkedin.scraper';
import type { ScraperConfig, ScrapeOutput } from '@/models/job.model';
import { logger } from '@/utils/helpers';

// ESM'de __dirname yok, bu şekilde elde ediyoruz
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

/**
 * .env'den konfigürasyon okur, varsayılan değerler kullanır.
 * process.env her zaman string döner, sayılara çeviriyoruz.
 */
const loadConfig = (): ScraperConfig => ({
  headless: process.env['HEADLESS'] !== 'false', // default: true
  slowMo: Number(process.env['SLOW_MO'] ?? 0),
  maxJobsPerKeyword: Number(process.env['MAX_JOBS_PER_KEYWORD'] ?? 25),
  requestDelayMin: Number(process.env['REQUEST_DELAY_MIN'] ?? 1000),
  requestDelayMax: Number(process.env['REQUEST_DELAY_MAX'] ?? 3000),
});

/**
 * Scraper'ı çalıştıran ana fonksiyon.
 *
 * 🔧 Test için bu parametreleri değiştir:
 * - keywords: Aramak istediğin iş pozisyonları
 * - location: Şehir veya ülke
 */
const main = async (): Promise<void> => {
  // ═══════════════════════════════════════════
  // 🔧 BURADAN DEĞİŞTİR — Arama parametreleri
  // ═══════════════════════════════════════════
  const keywords = ['Frontend Developer', 'React Developer'];
  const location = 'Turkey';
  // ═══════════════════════════════════════════

  const config = loadConfig();

  logger.info('🚀 LinkedIn Job Scraper başlatılıyor', {
    keywords,
    location,
    config: {
      headless: config.headless,
      maxJobsPerKeyword: config.maxJobsPerKeyword,
    },
  });

  const startTime = Date.now();

  // Scrape et!
  const { jobs, errors } = await fetchJobs(keywords, location, config);

  const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);

  // Sonuçları hazırla
  const output: ScrapeOutput = {
    scrapeTimestamp: new Date().toISOString(),
    query: { keywords, location },
    totalJobs: jobs.length,
    jobs,
    errors: errors.map((e) => {
      if (e.error.status === 'error') return e.error.error;
      // Bu durum normalde olmaz ama TypeScript memnun olsun
      return { code: 'PARSING_FAILED' as const, selector: 'unknown' };
    }),
  };

  // output/ klasörüne yaz
  const outputDir = join(__dirname, '..', 'output');
  mkdirSync(outputDir, { recursive: true });

  const outputPath = join(outputDir, 'jobs.json');
  writeFileSync(outputPath, JSON.stringify(output, null, 2), 'utf-8');

  // Özet
  logger.success(`\n${'═'.repeat(50)}`);
  logger.success(`SCRAPE TAMAMLANDI`);
  logger.success(`Süre: ${elapsed} saniye`);
  logger.success(`Toplam iş ilanı: ${jobs.length}`);
  logger.success(`Hatalar: ${errors.length}`);
  logger.success(`Çıktı: ${outputPath}`);
  logger.success(`${'═'.repeat(50)}`);

  // İlk 5 sonucu göster (quick preview)
  if (jobs.length > 0) {
    logger.info('\n📋 İlk 5 sonuç:');
    jobs.slice(0, 5).forEach((job, i) => {
      console.log(`  ${i + 1}. ${job.title} @ ${job.company} (${job.location})`);
      console.log(`     🔗 ${job.link}\n`);
    });
  } else {
    logger.warn('Hiç iş ilanı bulunamadı. Olası sebepler:');
    logger.warn('  1. LinkedIn AuthWall (login gerekli olabilir)');
    logger.warn('  2. Bot algılama aktif');
    logger.warn('  3. Selector\'lar değişmiş olabilir');
    logger.warn('  4. Ağ bağlantı sorunu');
    logger.warn('\nDebug için .env dosyasında HEADLESS=false yapıp tekrar dene');
  }
};

// Çalıştır
main().catch((err) => {
  logger.error('Kritik hata — scraper çöktü', {
    error: err instanceof Error ? err.message : 'Unknown error',
    stack: err instanceof Error ? err.stack : undefined,
  });
  process.exit(1);
});
