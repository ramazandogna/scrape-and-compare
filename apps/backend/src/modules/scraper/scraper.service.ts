/**
 * Scraper Service — orchestration layer.
 *
 * This file answers "when, in what order, what to call".
 * The "how to do it" details live under helpers/:
 *   - resource.ts → network optimization (resource blocking, page pool)
 *   - parsers.ts  → DOM parsing (search + detail pages)
 *   - config.ts   → .env config, enrichment, deduplication
 *
 * Flow:
 *   1. Load config (params or .env fallback)
 *   2. Launch browser (stealth)
 *   3. Scan search pages (per keyword)
 *   4. Fetch detail pages in parallel (N tabs)
 *   5. Skill extraction + salary parsing
 *   6. Upsert to DB (PostgreSQL via Prisma)
 *   7. Write JSON file (debug/backup)
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
  paginatedSearchScan,
  parallelFetchDetails,
  loadFastConfig,
  generateOutputFilename,
  enrichJobsWithExtractors,
  filterLowQualityJobs,
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
import type { PaginatedSearchOutcome } from './helpers';

interface KeywordSearchData {
  keyword: string;
  outcome: PaginatedSearchOutcome;
}

interface KeywordOutcome {
  keyword: string;
  collected: number;
  target: number;
  pagesScanned: number;
  targetReached: boolean;
  exhausted: boolean;
  blocked: boolean;
}
import type { FastScraperConfig } from './helpers';
import type { Prisma } from '@scrape/database';
import { ScraperStatus } from '@scrape/database';

// ═══════════════════════════════════════════
// MAIN SERVICE
// ═══════════════════════════════════════════

@Injectable()
export class ScraperService {
  constructor(
    private readonly browserService: BrowserService,
    private readonly prisma: PrismaService,
  ) {}

  /**
   * Runs a fast scrape — called by the CLI or the BullMQ Worker.
   *
   * @param jobData Queue payload — keywords, location and optional config override
   * @param onProgress Optional progress callback — the processor invokes it at each phase
   * @returns ScrapeJobCompleted — the Worker writes this result to Redis
   *
   * Audit lifecycle:
   *   createAudit (IDLE) → SCANNING → EXTRACTING → COMPLETED
   *   Any failure along the way → FAILED
   */
  async runFastScrape(
    jobData: ScrapeJobData,
    onProgress?: (phase: 'SCANNING' | 'EXTRACTING', message: string, percentage: number) => void,
  ): Promise<ScrapeJobCompleted> {
    const { keywords, location, userId } = jobData;
    const config = loadFastConfig(keywords.length, jobData.config);

    // Create the audit record (join keywords with commas — schema stores a single string)
    const auditId = await createAudit(this.prisma, keywords.join(', '), location, userId);

    logger.info('FAST LinkedIn Job Scraper v2.0.0 (NestJS) başlatılıyor', {
      keywords,
      location,
      searchConcurrency: config.searchConcurrency,
      parallelTabs: config.parallelTabs,
      maxSearchPages: config.maxSearchPages,
      maxJobsPerKeyword: config.maxJobsPerKeyword,
      maxDetailFetch: config.maxDetailFetch,
      targetNewJobs: config.targetNewJobs,
      adaptiveDelay: keywords.length > 2 ? '1.5x' : '1x',
      auditId,
    });

    const startTime = Date.now();

    try {
      // IDLE → SCANNING
      await transitionAudit(this.prisma, auditId, ScraperStatus.SCANNING);

      onProgress?.('SCANNING', `${keywords.length} keyword taranıyor...`, 0);

      const { jobs, errors, perKeyword } = await this.executeScrape(keywords, location, config, onProgress);
      await updateAuditFound(this.prisma, auditId, jobs.length);

      // SCANNING → EXTRACTING
      await transitionAudit(this.prisma, auditId, ScraperStatus.EXTRACTING);

      onProgress?.('EXTRACTING', `${jobs.length} ilan zenginleştiriliyor...`, 80);
      const enrichedJobs = enrichJobsWithExtractors(jobs);
      const qualityJobs = filterLowQualityJobs(enrichedJobs);

      if (enrichedJobs.length !== qualityJobs.length) {
        logger.info(
          `[QUALITY] ${enrichedJobs.length - qualityJobs.length} düşük kaliteli ilan filtrelendi (description yok + skill yok)`,
        );
      }

      // STEP 4: persist to DB (upsert — update if exists, otherwise create)
      const dbResult = await upsertJobs(this.prisma, qualityJobs, {
        userId,
        auditId,
      });
      onProgress?.('EXTRACTING', `${dbResult.created + dbResult.updated} ilan DB'ye kaydedildi`, 95);
      await updateAuditExtracted(this.prisma, auditId, dbResult.created + dbResult.updated);

      // EXTRACTING → COMPLETED
      const scrapeErrors = errors.map((e) => e.error);
      await completeAudit(this.prisma, auditId, {
        totalFound: jobs.length,
        totalExtracted: dbResult.created + dbResult.updated,
        errorCount: errors.length + dbResult.failed,
        errorDetails: scrapeErrors as unknown as Prisma.InputJsonValue,
      });

      // STEP 5: JSON output (debug/backup — may be removed later)
      this.writeOutput(qualityJobs, errors, keywords, location);

      const durationMs = Date.now() - startTime;
      this.printSummary(qualityJobs, errors, config, startTime, dbResult);

      const targetPerKeyword = config.targetPerKeyword;
      const keywordsHitTarget = perKeyword.filter((entry) => entry.targetReached).length;
      const discoveryMessage = this.buildDiscoveryMessage({
        targetNewJobs: config.targetNewJobs,
        totalJobs: jobs.length,
        created: dbResult.created,
        updated: dbResult.updated,
      });

      return {
        status: 'completed' as const,
        targetNewJobs: config.targetNewJobs,
        targetReached: dbResult.created >= config.targetNewJobs,
        discoveryMessage,
        totalJobs: jobs.length,
        filtered: enrichedJobs.length - qualityJobs.length,
        created: dbResult.created,
        updated: dbResult.updated,
        failed: dbResult.failed,
        durationMs,
        auditId,
        targetPerKeyword,
        keywordsHitTarget,
        keywordsTotal: keywords.length,
        perKeyword,
      };
    } catch (err) {
      // Any unexpected error along the way → FAILED
      const message = err instanceof Error ? err.message : 'Unknown error';
      await failAudit(this.prisma, auditId, [
        { code: 'NETWORK_ERROR', message },
      ] as unknown as Prisma.InputJsonValue).catch(() => {
        // If failAudit itself errors (DB connection may be down), swallow silently
        logger.error('[AUDIT] failAudit yazılamadı — DB bağlantısı kopmuş olabilir');
      });
      throw err; // Re-throw — caught upstream by the CLI
    }
  }

  /** Performs the scraping operation — launch browser, scan, close */
  private async executeScrape(
    keywords: string[],
    location: string,
    config: FastScraperConfig,
    onProgress?: (phase: 'SCANNING' | 'EXTRACTING', message: string, percentage: number) => void,
  ): Promise<{
    jobs: JobListing[];
    errors: Array<{ keyword: string; error: ScraperErrorLegacy }>;
    perKeyword: KeywordOutcome[];
  }> {
    const context = await this.browserService.launch(config);
    // Avoid recounting the same job when multiple keywords find it — the sets
    // are shared across all keywords.
    const seenIds = new Set<string>();
    const seenLinks = new Set<string>();

    try {
      // STEP 1: scan search pages concurrently
      logger.info('ADIM 1: Search sayfaları taranıyor...', {
        keywords: keywords.length,
        concurrency: config.searchConcurrency,
        targetPerKeyword: config.targetPerKeyword,
        maxSearchPages: config.maxSearchPages,
      });

      // Create a dedicated search page for each concurrent slot
      const searchPool = await createPagePool(
        this.browserService,
        context,
        config.searchConcurrency,
      );

      const searchResults = await runConcurrent(
        keywords,
        async (keyword, _itemIndex, slotIndex): Promise<KeywordSearchData> => {
          const page = searchPool.pages[slotIndex]!;
          const outcome = await paginatedSearchScan(
            page,
            keyword,
            location,
            {
              target: config.targetPerKeyword,
              maxPages: config.maxSearchPages,
              onPageFetched: (event) => {
                // per-page progress: 0–50% range, divided by keyword count and target pages
                const denom = keywords.length * config.maxSearchPages;
                const numerator = _itemIndex * config.maxSearchPages + event.pageIndex;
                const pct = Math.min(50, Math.round((numerator / denom) * 50));
                onProgress?.(
                  'SCANNING',
                  `"${keyword}" — sayfa ${event.pageIndex}: ${event.collected}/${event.target} ilan`,
                  pct,
                );
              },
            },
            seenIds,
            seenLinks,
          );

          // keyword scan progress: 0–50% range (at minimum this keyword finished)
          const pct = Math.round(((_itemIndex + 1) / keywords.length) * 50);
          onProgress?.(
            'SCANNING',
            `"${keyword}" tarandı (${outcome.jobs.length}/${config.targetPerKeyword})`,
            pct,
          );

          return { keyword, outcome };
        },
        {
          concurrency: config.searchConcurrency,
          delayBetweenMs: randomBetween(config.requestDelayMin, config.requestDelayMax),
          label: 'keyword-search',
        },
      );

      await searchPool.close();

      // Aggregate results — pull jobs from fulfilled, errors from rejected
      const allJobs: JobListing[] = [];
      const errors: Array<{ keyword: string; error: ScraperErrorLegacy }> = [];
      const perKeyword: KeywordOutcome[] = [];

      for (const result of extractFulfilled(searchResults)) {
        allJobs.push(...result.data.outcome.jobs);
        perKeyword.push({
          keyword: result.data.keyword,
          collected: result.data.outcome.jobs.length,
          target: config.targetPerKeyword,
          pagesScanned: result.data.outcome.pagesScanned,
          targetReached: result.data.outcome.targetReached,
          exhausted: result.data.outcome.exhausted,
          blocked: result.data.outcome.blocked,
        });
      }

      for (const result of extractRejected(searchResults)) {
        errors.push({
          keyword: result.item,
          error: { code: 'PARSING_FAILED', selector: 'search', html: result.error },
        });
        perKeyword.push({
          keyword: result.item,
          collected: 0,
          target: config.targetPerKeyword,
          pagesScanned: 0,
          targetReached: false,
          exhausted: false,
          blocked: true,
        });
      }

      logger.info(`Search tamamlandı — ${allJobs.length} unique job bulundu`, {
        perKeyword: perKeyword.map((k) => `${k.keyword}: ${k.collected}/${k.target} (${k.pagesScanned}p)`),
      });

      // STEP 2: fetch detail pages in parallel
      if (config.fetchDetails && allJobs.length > 0) {
        const jobsToEnrich = allJobs.slice(0, config.maxDetailFetch);
        logger.info(`ADIM 2: ${jobsToEnrich.length} ilanın detayı ${config.parallelTabs} paralel tab ile çekilecek...`);
        onProgress?.('SCANNING', `${jobsToEnrich.length} ilanın detayı çekiliyor...`, 55);

        const detailPool = await createPagePool(this.browserService, context, config.parallelTabs);
        const enriched = await parallelFetchDetails(detailPool, jobsToEnrich, config.requestDelayMin, config.requestDelayMax);

        for (let i = 0; i < enriched.length; i++) {
          if (enriched[i]) allJobs[i] = enriched[i]!;
        }

        await detailPool.close();
      }

      return { jobs: allJobs, errors, perKeyword };
    } finally {
      await this.browserService.close();
    }
  }

  /** Writes results to a JSON file */
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

  /** Prints the result summary to the console */
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

  /** Shows the first 5 results */
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

  /** Builds a user-friendly status note for the new-listings target */
  private buildDiscoveryMessage(input: {
    targetNewJobs: number;
    totalJobs: number;
    created: number;
    updated: number;
  }): string {
    const { targetNewJobs, totalJobs, created, updated } = input;

    if (created >= targetNewJobs) {
      return `Hedef tamam: ${created} yeni ilan bulundu.`;
    }

    if (totalJobs < targetNewJobs) {
      return `Sadece ${totalJobs} ilan kaynağına erişildi; arama kriteri dar veya piyasada yeni ilan az olabilir.`;
    }

    if (created === 0 && updated > 0) {
      return 'Yeni ilan bulunamadı; bu sonuçların çoğu sistemde zaten vardı ve güncellendi.';
    }

    if (created < targetNewJobs && updated > 0) {
      return `${created} yeni ilan eklendi, ${updated} mevcut ilan güncellendi. Hedef ${targetNewJobs} yeni ilan için sistem denedi ancak yeterli yeni kayıt yoktu.`;
    }

    return `${targetNewJobs} yeni ilan hedeflendi, ${created} yeni ilan bulundu.`;
  }
}
