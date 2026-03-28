/**
 * Scraper Service — Orkestrasyon katmanı.
 *
 * Bu dosya "ne zaman, hangi sırayla, neyi çağır" sorusuna cevap verir.
 * "Nasıl yapılır" detayları helpers/ dizininde yaşar:
 *   - resource.ts → Ağ optimizasyonu (resource blocking, page pool)
 *   - parsers.ts  → DOM parsing (search + detail sayfaları)
 *   - config.ts   → .env config, enrichment, deduplication
 *
 * Akış:
 *   1. Config yükle (.env)
 *   2. Browser aç (stealth)
 *   3. Search sayfalarını tara (keyword başına)
 *   4. Detail sayfalarını paralel çek (N tab)
 *   5. Skill extraction + salary parsing
 *   6. JSON dosyasına yaz
 */

import { Injectable } from '@nestjs/common';
import { writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import type {
  ExtractedSkill,
  JobListing,
  ScrapeOutput,
  ScraperErrorLegacy,
} from '@scrape/shared';
import { BrowserService } from './browser.service';
import { sleep, randomBetween, logger } from '@/utils/helpers';
import {
  enableResourceBlocking,
  createPagePool,
  fastParseSearchPage,
  parallelFetchDetails,
  loadKeywords,
  loadLocation,
  loadFastConfig,
  generateOutputFilename,
  enrichJobsWithExtractors,
  deduplicateJobs,
} from './helpers';
import type { FastScraperConfig } from './helpers';

// ═══════════════════════════════════════════
// ANA SERVİS
// ═══════════════════════════════════════════

@Injectable()
export class ScraperService {
  constructor(private readonly browserService: BrowserService) {}

  /**
   * Fast scrape çalıştırır — CLI entry point'ten çağrılır.
   */
  async runFastScrape(): Promise<void> {
    const keywords = loadKeywords();
    const location = loadLocation();
    const config = loadFastConfig(keywords.length);

    logger.info('⚡ FAST LinkedIn Job Scraper v2.0.0 (NestJS) başlatılıyor', {
      keywords,
      location,
      parallelTabs: config.parallelTabs,
      maxDetailFetch: config.maxDetailFetch,
      adaptiveDelay: keywords.length > 2 ? '1.5x' : '1x',
    });

    const startTime = Date.now();

    const { jobs, errors } = await this.executeScrape(keywords, location, config);

    logger.info('🧠 Skill extraction ve salary parsing başlatılıyor...');
    const enrichedJobs = enrichJobsWithExtractors(jobs);

    this.writeOutput(enrichedJobs, errors, keywords, location);
    this.printSummary(enrichedJobs, errors, config, startTime);
  }

  /** Scraping işlemini gerçekleştirir — browser aç, tara, kapat */
  private async executeScrape(
    keywords: string[],
    location: string,
    config: FastScraperConfig,
  ): Promise<{
    jobs: JobListing[];
    errors: Array<{ keyword: string; error: ScraperErrorLegacy }>;
  }> {
    const context = await this.browserService.launch(config);
    const allJobs: JobListing[] = [];
    const errors: Array<{ keyword: string; error: ScraperErrorLegacy }> = [];
    const seenIds = new Set<string>();
    const seenLinks = new Set<string>();

    try {
      // ADIM 1: Search sayfalarını tara
      logger.info('\n🔍 ADIM 1: Search sayfaları taranıyor...');
      const searchPage = await this.browserService.createPage(context);
      await enableResourceBlocking(searchPage);

      for (const keyword of keywords) {
        if (keywords.indexOf(keyword) > 0) {
          const delay = randomBetween(config.requestDelayMin, config.requestDelayMax);
          logger.info(`Sonraki arama öncesi ${delay}ms bekleniyor...`);
          await sleep(delay);
        }

        try {
          const jobs = await fastParseSearchPage(searchPage, keyword, location);
          const newJobs = deduplicateJobs(jobs, config.maxJobsPerKeyword, seenIds, seenLinks);
          allJobs.push(...newJobs);
          logger.info(`Toplam unique: ${allJobs.length}`);
        } catch (err) {
          const message = err instanceof Error ? err.message : 'Unknown';
          errors.push({
            keyword,
            error: { code: 'PARSING_FAILED', selector: 'search', html: message },
          });
          logger.error(`"${keyword}" araması başarısız: ${message}`);
        }
      }

      await searchPage.close();

      // ADIM 2: Detail sayfalarını paralel çek
      if (config.fetchDetails && allJobs.length > 0) {
        const jobsToEnrich = allJobs.slice(0, config.maxDetailFetch);
        logger.info(`\n📝 ADIM 2: ${jobsToEnrich.length} ilanın detayı ${config.parallelTabs} paralel tab ile çekilecek...`);

        const pool = await createPagePool(this.browserService, context, config.parallelTabs);
        const enriched = await parallelFetchDetails(pool, jobsToEnrich, config.requestDelayMin, config.requestDelayMax);

        for (let i = 0; i < enriched.length; i++) {
          if (enriched[i]) allJobs[i] = enriched[i]!;
        }

        await pool.close();
      }
    } finally {
      await this.browserService.close();
    }

    return { jobs: allJobs, errors };
  }

  /** Sonuçları JSON dosyasına yazar */
  private writeOutput(
    jobs: JobListing[],
    errors: Array<{ keyword: string; error: ScraperErrorLegacy }>,
    keywords: string[],
    location: string,
  ): void {
    const output: ScrapeOutput = {
      scrapeTimestamp: new Date().toISOString(),
      query: { keywords, location },
      totalJobs: jobs.length,
      jobs,
      errors: errors.map((e) => e.error),
    };

    const outputDir = join(process.cwd(), 'output');
    mkdirSync(outputDir, { recursive: true });

    const filename = generateOutputFilename();
    const outputPath = join(outputDir, filename);
    writeFileSync(outputPath, JSON.stringify(output, null, 2), 'utf-8');

    logger.success(`Çıktı: ${outputPath}`);
  }

  /** Sonuç özetini konsola yazdırır */
  private printSummary(
    jobs: JobListing[],
    errors: Array<{ keyword: string; error: ScraperErrorLegacy }>,
    config: FastScraperConfig,
    startTime: number,
  ): void {
    const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
    const withSkills = jobs.filter((j) => j.skills.length > 0).length;
    const withSalary = jobs.filter((j) => j.salaryParsed !== null).length;
    const totalSkills = jobs.reduce((sum, j) => sum + j.skills.length, 0);
    const mainSkillCount = jobs.reduce((sum, j) => sum + j.skills.filter((s: ExtractedSkill) => s.isMain).length, 0);
    const withDesc = jobs.filter((j) => j.description && j.description.length > 20).length;
    const withReqs = jobs.filter((j) => j.requirements.length > 0).length;

    logger.success(`\n${'═'.repeat(55)}`);
    logger.success(`⚡ FAST SCRAPE v2.0.0 (NestJS) TAMAMLANDI`);
    logger.success(`${'═'.repeat(55)}`);
    logger.success(`Süre: ${elapsed} saniye`);
    logger.success(`Toplam iş ilanı: ${jobs.length}`);
    logger.success(`Description çekilen: ${withDesc}`);
    logger.success(`Requirements çekilen: ${withReqs}`);
    logger.success(`Skills çıkarılan: ${withSkills} ilan (${totalSkills} toplam, ${mainSkillCount} main)`);
    logger.success(`Salary parse edilen: ${withSalary}`);
    logger.success(`Hatalar: ${errors.length}`);
    logger.success(`Paralel tab: ${config.parallelTabs}`);
    logger.success(`${'═'.repeat(55)}`);

    this.printTopResults(jobs);
  }

  /** İlk 5 sonucu gösterir */
  private printTopResults(jobs: JobListing[]): void {
    if (jobs.length === 0) return;

    logger.info('\n📋 İlk 5 sonuç:');
    jobs.slice(0, 5).forEach((job, i) => {
      console.log(`  ${i + 1}. ${job.title} @ ${job.company} (${job.location})`);
      if (job.seniorityLevel) console.log(`     📊 Seviye: ${job.seniorityLevel}`);
      if (job.employmentType) console.log(`     💼 Tip: ${job.employmentType}`);
      if (job.skills.length > 0) {
        const mainSkillNames = job.skills.filter((s: ExtractedSkill) => s.isMain).map((s: ExtractedSkill) => s.name);
        const sideSkillNames = job.skills.filter((s: ExtractedSkill) => !s.isMain).map((s: ExtractedSkill) => s.name);
        if (mainSkillNames.length > 0) console.log(`     🎯 Ana: ${mainSkillNames.join(', ')}`);
        if (sideSkillNames.length > 0) console.log(`     📌 Yan: ${sideSkillNames.join(', ')}`);
      }
      if (job.salaryParsed) {
        const { min, max, currency, period } = job.salaryParsed;
        const range = max ? `${min?.toLocaleString('tr-TR')}-${max.toLocaleString('tr-TR')}` : `${min?.toLocaleString('tr-TR')}+`;
        console.log(`     💰 ${range} TRY/ay (${currency} ${period})`);
      }
      if (job.description) console.log(`     📝 ${job.description.substring(0, 150)}...`);
      if (job.requirements.length > 0) console.log(`     ✅ Gereksinimler (${job.requirements.length} madde)`);
      console.log(`     🔗 ${job.link}\n`);
    });
  }
}
