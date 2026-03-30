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
 *   1. Config yükle (parametre veya .env fallback)
 *   2. Browser aç (stealth)
 *   3. Search sayfalarını tara (keyword başına)
 *   4. Detail sayfalarını paralel çek (N tab)
 *   5. Skill extraction + salary parsing
 *   6. DB'ye upsert (PostgreSQL via Prisma)
 *   7. JSON dosyasına yaz (debug/backup)
 */

import { Injectable } from '@nestjs/common';
import { writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import type {
  ExtractedSkill,
  JobListing,
  ScrapeOutput,
  ScraperErrorLegacy,
  ScrapeJobData,
  ScrapeJobCompleted,
} from '@scrape/shared';
import { BrowserService } from './browser.service';
import { PrismaService } from '@/database/prisma.service';
import { randomBetween, logger } from '@/utils/helpers';
import {
  createPagePool,
  fastParseSearchPage,
  parallelFetchDetails,
  loadFastConfig,
  generateOutputFilename,
  enrichJobsWithExtractors,
  deduplicateJobs,
  upsertJobs,
  createAudit,
  transitionAudit,
  updateAuditFound,
  updateAuditExtracted,
  completeAudit,
  failAudit,
  runConcurrent,
  extractFulfilled,
  extractRejected,
} from './helpers';
import type { FastScraperConfig } from './helpers';
import type { Prisma } from '@scrape/database';
import { ScraperStatus } from '@scrape/database';

// ═══════════════════════════════════════════
// ANA SERVİS
// ═══════════════════════════════════════════

@Injectable()
export class ScraperService {
  constructor(
    private readonly browserService: BrowserService,
    private readonly prisma: PrismaService,
  ) {}

  /**
   * Fast scrape çalıştırır — CLI veya BullMQ Worker tarafından çağrılır.
   *
   * @param jobData Queue payload'ı — keywords, location ve opsiyonel config override
   * @returns ScrapeJobCompleted — Worker bu sonucu Redis'e yazar
   *
   * Audit lifecycle:
   *   createAudit (IDLE) → SCANNING → EXTRACTING → COMPLETED
   *   Herhangi bir adımda hata → FAILED
   */
  async runFastScrape(jobData: ScrapeJobData): Promise<ScrapeJobCompleted> {
    const { keywords, location } = jobData;
    const config = loadFastConfig(keywords.length, jobData.config);

    // Audit kaydı oluştur (keyword'leri virgülle birleştir — schema tek string)
    const auditId = await createAudit(this.prisma, keywords.join(', '), location);

    logger.info('FAST LinkedIn Job Scraper v2.0.0 (NestJS) başlatılıyor', {
      keywords,
      location,
      searchConcurrency: config.searchConcurrency,
      parallelTabs: config.parallelTabs,
      maxDetailFetch: config.maxDetailFetch,
      adaptiveDelay: keywords.length > 2 ? '1.5x' : '1x',
      auditId,
    });

    const startTime = Date.now();

    try {
      // IDLE → SCANNING
      await transitionAudit(this.prisma, auditId, ScraperStatus.SCANNING);

      const { jobs, errors } = await this.executeScrape(keywords, location, config);
      await updateAuditFound(this.prisma, auditId, jobs.length);

      // SCANNING → EXTRACTING
      await transitionAudit(this.prisma, auditId, ScraperStatus.EXTRACTING);

      logger.info('🧠 Skill extraction ve salary parsing başlatılıyor...');
      const enrichedJobs = enrichJobsWithExtractors(jobs);

      // ADIM 4: DB'ye kaydet (upsert — varsa güncelle, yoksa oluştur)
      const dbResult = await upsertJobs(this.prisma, enrichedJobs);
      await updateAuditExtracted(this.prisma, auditId, dbResult.created + dbResult.updated);

      // EXTRACTING → COMPLETED
      const scrapeErrors = errors.map((e) => e.error);
      await completeAudit(this.prisma, auditId, {
        totalFound: jobs.length,
        totalExtracted: dbResult.created + dbResult.updated,
        errorCount: errors.length + dbResult.failed,
        errorDetails: scrapeErrors as unknown as Prisma.InputJsonValue,
      });

      // ADIM 5: JSON çıktısı (debug/backup — ileride kaldırılabilir)
      this.writeOutput(enrichedJobs, errors, keywords, location);

      const durationMs = Date.now() - startTime;
      this.printSummary(enrichedJobs, errors, config, startTime, dbResult);

      return {
        status: 'completed' as const,
        totalJobs: jobs.length,
        created: dbResult.created,
        updated: dbResult.updated,
        failed: dbResult.failed,
        durationMs,
        auditId,
      };
    } catch (err) {
      // Herhangi bir adımda beklenmeyen hata → FAILED
      const message = err instanceof Error ? err.message : 'Unknown error';
      await failAudit(this.prisma, auditId, [
        { code: 'NETWORK_ERROR', message },
      ] as unknown as Prisma.InputJsonValue).catch(() => {
        // failAudit kendisi de hata verirse (DB bağlantısı kopmuş olabilir) sessizce geç
        logger.error('[AUDIT] failAudit yazılamadı — DB bağlantısı kopmuş olabilir');
      });
      throw err; // Hatayı yukarıya fırlat — CLI'da yakalanır
    }
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
    const seenIds = new Set<string>();
    const seenLinks = new Set<string>();

    try {
      // ADIM 1: Search sayfalarını concurrent tara
      logger.info('ADIM 1: Search sayfaları taranıyor...', {
        keywords: keywords.length,
        concurrency: config.searchConcurrency,
      });

      // Her concurrent slot için ayrı bir search page oluştur
      const searchPool = await createPagePool(
        this.browserService,
        context,
        config.searchConcurrency,
      );

      const searchResults = await runConcurrent(
        keywords,
        async (keyword, _itemIndex, slotIndex) => {
          const page = searchPool.pages[slotIndex]!;
          const jobs = await fastParseSearchPage(page, keyword, location);
          return jobs;
        },
        {
          concurrency: config.searchConcurrency,
          delayBetweenMs: randomBetween(config.requestDelayMin, config.requestDelayMax),
          label: 'keyword-search',
        },
      );

      await searchPool.close();

      // Sonuçları topla — fulfilled olanlardan job'ları, rejected olanlardan error'ları çıkar
      const allJobs: JobListing[] = [];
      const errors: Array<{ keyword: string; error: ScraperErrorLegacy }> = [];

      for (const result of extractFulfilled(searchResults)) {
        const newJobs = deduplicateJobs(result.data, config.maxJobsPerKeyword, seenIds, seenLinks);
        allJobs.push(...newJobs);
      }

      for (const result of extractRejected(searchResults)) {
        errors.push({
          keyword: result.item,
          error: { code: 'PARSING_FAILED', selector: 'search', html: result.error },
        });
      }

      logger.info(`Search tamamlandı — ${allJobs.length} unique job bulundu`);

      // ADIM 2: Detail sayfalarını paralel çek
      if (config.fetchDetails && allJobs.length > 0) {
        const jobsToEnrich = allJobs.slice(0, config.maxDetailFetch);
        logger.info(`ADIM 2: ${jobsToEnrich.length} ilanın detayı ${config.parallelTabs} paralel tab ile çekilecek...`);

        const detailPool = await createPagePool(this.browserService, context, config.parallelTabs);
        const enriched = await parallelFetchDetails(detailPool, jobsToEnrich, config.requestDelayMin, config.requestDelayMax);

        for (let i = 0; i < enriched.length; i++) {
          if (enriched[i]) allJobs[i] = enriched[i]!;
        }

        await detailPool.close();
      }

      return { jobs: allJobs, errors };
    } finally {
      await this.browserService.close();
    }
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
    dbResult?: { created: number; updated: number; failed: number },
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
    if (dbResult) {
      logger.success(`DB: ${dbResult.created} yeni, ${dbResult.updated} güncellenen, ${dbResult.failed} hatalı`);
    }
    logger.success(`Hatalar: ${errors.length}`);
    logger.success(`Paralel tab: ${config.parallelTabs}`);
    logger.success(`${'═'.repeat(55)}`);  

    this.printTopResults(jobs);
  }

  /** İlk 5 sonucu gösterir */
  private printTopResults(jobs: JobListing[]): void {
    if (jobs.length === 0) return;

    logger.info('İlk 5 sonuç:');
    jobs.slice(0, 5).forEach((job, i) => {
      const mainSkillNames = job.skills.filter((s: ExtractedSkill) => s.isMain).map((s: ExtractedSkill) => s.name);
      const sideSkillNames = job.skills.filter((s: ExtractedSkill) => !s.isMain).map((s: ExtractedSkill) => s.name);

      logger.info(`#${i + 1} ${job.title} @ ${job.company}`, {
        location: job.location,
        seniorityLevel: job.seniorityLevel ?? undefined,
        employmentType: job.employmentType ?? undefined,
        mainSkills: mainSkillNames.length > 0 ? mainSkillNames : undefined,
        sideSkills: sideSkillNames.length > 0 ? sideSkillNames : undefined,
        salary: job.salaryParsed
          ? `${job.salaryParsed.min?.toLocaleString('tr-TR')}-${job.salaryParsed.max?.toLocaleString('tr-TR')} ${job.salaryParsed.currency}/${job.salaryParsed.period}`
          : undefined,
        description: job.description ? `${job.description.substring(0, 100)}...` : undefined,
        requirements: job.requirements.length > 0 ? job.requirements.length : undefined,
        url: job.link,
      });
    });
  }
}
