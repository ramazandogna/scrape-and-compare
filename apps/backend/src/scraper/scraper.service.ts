/**
 * Scraper Service — Fast LinkedIn Scraper'ın NestJS servis versiyonu.
 *
 * Eski index.fast.ts + fast.scraper.ts'in birleşimi.
 * Değişenler:
 * - @Injectable() → NestJS DI ile BrowserService inject ediliyor
 * - Tüm logic küçük named helper'lara ayrılmış (copilot-instructions kuralı #8)
 * - Tipler @scrape/shared'den geliyor (cross-package import)
 * - İleride PrismaService inject edilecek (DB'ye kaydet)
 *
 * Değişmeyenler:
 * - Resource blocking (sadece HTML)
 * - Paralel tab pool (5 tab)
 * - Batch + cooldown stratejisi
 * - SSR tabanlı DOM parsing
 */

import { Injectable } from '@nestjs/common';
import { writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import type { BrowserContext, Page, Route } from 'playwright';
import type {
  JobListing,
  ScrapeOutput,
  ScraperConfig,
  ScraperErrorLegacy,
} from '@scrape/shared';
import { BrowserService } from '@/scraper/browser.service';
import { extractSkills } from '@/extractors/skill.extractor';
import { parseSalary, extractSalaryFromDescription } from '@/extractors/salary.parser';
import { sleep, randomBetween, logger } from '@/utils/helpers';

// ═══════════════════════════════════════════
// RESOURCE BLOCKER
// ═══════════════════════════════════════════

/** Engellenen resource tipleri — LinkedIn verisi için gereksiz */
const BLOCKED_RESOURCE_TYPES = new Set([
  'stylesheet', 'image', 'media', 'font', 'script',
  'texttrack', 'xhr', 'fetch', 'eventsource',
  'websocket', 'manifest', 'other',
]);

/** Engellenen URL pattern'leri — tracking, analytics, bot protection */
const BLOCKED_URL_PATTERNS = [
  'protechts.net', 'google-analytics', 'doubleclick',
  'facebook.com/tr', 'bat.bing.com', 'cdn.linkedin.com',
  'static.licdn.com', 'media.licdn.com', 'platform.linkedin.com',
];

/** Page'e resource blocking uygular — sadece document HTML geçer */
const enableResourceBlocking = async (page: Page): Promise<void> => {
  await page.route('**/*', (route: Route) => {
    const resourceType = route.request().resourceType();
    const url = route.request().url();

    if (resourceType === 'document') {
      route.continue();
      return;
    }

    if (BLOCKED_RESOURCE_TYPES.has(resourceType)) {
      route.abort();
      return;
    }

    if (BLOCKED_URL_PATTERNS.some((pattern) => url.includes(pattern))) {
      route.abort();
      return;
    }

    route.continue();
  });
};

// ═══════════════════════════════════════════
// PAGE POOL
// ═══════════════════════════════════════════

interface PagePool {
  pages: Page[];
  close: () => Promise<void>;
}

/** Paralel page pool oluşturur — her tab'da resource blocking aktif */
const createPagePool = async (
  browserService: BrowserService,
  context: BrowserContext,
  size: number,
): Promise<PagePool> => {
  logger.info(`${size} paralel tab oluşturuluyor...`);

  const pages: Page[] = [];
  for (let i = 0; i < size; i++) {
    const page = await browserService.createPage(context);
    await enableResourceBlocking(page);
    pages.push(page);
  }

  logger.success(`${size} paralel tab hazır (resource blocking aktif)`);

  return {
    pages,
    close: async () => {
      for (const page of pages) {
        try { await page.close(); } catch { /* Zaten kapanmış olabilir */ }
      }
    },
  };
};

// ═══════════════════════════════════════════
// SEARCH PAGE PARSER
// ═══════════════════════════════════════════

/** LinkedIn search URL'i oluşturur */
const buildSearchUrl = (keyword: string, location: string): string => {
  const params = new URLSearchParams({
    keywords: keyword,
    location,
    f_TPR: 'r604800',
    position: '1',
    pageNum: '0',
  });
  return `https://www.linkedin.com/jobs/search/?${params.toString()}`;
};

/**
 * Search sayfasından job card'larını parse eder.
 * Resource blocking aktif — sayfa ~500ms'de yüklenir.
 */
const fastParseSearchPage = async (
  page: Page,
  keyword: string,
  location: string,
): Promise<JobListing[]> => {
  const url = buildSearchUrl(keyword, location);
  logger.info(`[FAST] Aranıyor: "${keyword}" — ${location}`);

  const startTime = Date.now();

  await page.goto(url, {
    waitUntil: 'domcontentloaded',
    timeout: 15000,
  });

  const loadTime = Date.now() - startTime;
  logger.info(`[FAST] Sayfa yüklendi: ${loadTime}ms`);

  if (await isPageBlocked(page)) {
    logger.error('[FAST] LinkedIn bizi engelledi! (Captcha/AuthWall)');
    return [];
  }

  const now = new Date().toISOString();
  const jobs = await page.evaluate(parseJobCardsFromDom, now);

  logger.success(`[FAST] "${keyword}" → ${jobs.length} job card parse edildi (${loadTime}ms)`);
  return jobs;
};

/** Captcha veya AuthWall kontrolü */
const isPageBlocked = async (page: Page): Promise<boolean> =>
  page.evaluate(() => {
    const body = (document.body.textContent ?? '').toLowerCase();
    return (
      body.includes('captcha') ||
      body.includes('unusual activity') ||
      body.includes('verify you are a human') ||
      body.includes('authwall')
    );
  });

/**
 * DOM'dan job card'larını parse eder — page.evaluate içinde çalışır.
 * Bu fonksiyon browser context'inde (Chromium V8) çalışır, Node.js'te değil.
 */
const parseJobCardsFromDom = (scrapedAt: string): JobListing[] => {
  const results: JobListing[] = [];

  const cardSelectors = [
    '.jobs-search__results-list li',
    '.job-search-card',
    '[data-tracking-control-name="public_jobs_jserp-result"]',
    '.base-card',
  ];

  let cards: NodeListOf<Element> | null = null;
  for (const selector of cardSelectors) {
    const found = document.querySelectorAll(selector);
    if (found.length > 0) {
      cards = found;
      break;
    }
  }

  if (!cards) return results;

  cards.forEach((card) => {
    try {
      const titleEl =
        card.querySelector('.base-search-card__title') ??
        card.querySelector('h3') ??
        card.querySelector('[class*="title"]');

      const companyEl =
        card.querySelector('.base-search-card__subtitle') ??
        card.querySelector('h4') ??
        card.querySelector('[class*="subtitle"]');

      const locationEl =
        card.querySelector('.job-search-card__location') ??
        card.querySelector('[class*="location"]');

      const linkEl =
        card.querySelector('a.base-card__full-link') ??
        card.querySelector('a[href*="/jobs/view/"]') ??
        card.querySelector('a');

      const dateEl =
        card.querySelector('time') ??
        card.querySelector('[class*="listed"]');

      const salaryEl =
        card.querySelector('[class*="salary"]') ??
        card.querySelector('[class*="compensation"]');

      const title = (titleEl?.textContent ?? '').trim();
      const company = (companyEl?.textContent ?? '').trim();
      const link = linkEl?.getAttribute('href') ?? '';

      if (!title || !company) return;

      const idFromUrl = link.match(/\/jobs\/view\/[^?]*?(\d{5,})/);
      const urnAttr = card.getAttribute('data-entity-urn') ?? '';
      const idFromUrn = urnAttr.match(/(\d{5,})/);
      const id = idFromUrl?.[1] ?? idFromUrn?.[1] ?? `unknown_${Date.now()}_${Math.random()}`;

      results.push({
        id,
        title,
        company,
        location: (locationEl?.textContent ?? '').trim() || 'Unknown',
        salary: (salaryEl?.textContent ?? '').trim() || null,
        salaryParsed: null,
        description: null,
        requirements: [],
        skills: [],
        seniorityLevel: null,
        employmentType: null,
        link: link.startsWith('http') ? link : `https://www.linkedin.com${link}`,
        postedDate: (dateEl?.textContent ?? '').trim() || dateEl?.getAttribute('datetime') || null,
        scrapedAt,
      });
    } catch {
      // Tek card hata verirse diğerlerine devam
    }
  });

  return results;
};

// ═══════════════════════════════════════════
// DETAIL PAGE PARSER
// ═══════════════════════════════════════════

const MAX_RETRIES = 2;

/** Tek bir job'un detail sayfasını parse eder — retry mekanizmalı */
const fastParseDetailPage = async (
  page: Page,
  job: JobListing,
  retryCount: number = 0,
): Promise<{ job: JobListing; success: boolean }> => {
  try {
    const cleanUrl = job.id.startsWith('unknown_')
      ? job.link.split('?')[0] ?? job.link
      : `https://www.linkedin.com/jobs/view/${job.id}`;

    const response = await page.goto(cleanUrl, {
      waitUntil: 'domcontentloaded',
      timeout: 10000,
    });

    const status = response?.status() ?? 0;
    if (status >= 400) {
      if (retryCount < MAX_RETRIES) {
        const backoff = retryCount === 0 ? 3000 : 6000;
        logger.warn(`[RETRY] HTTP ${status} — ${job.title.substring(0, 35)} — ${backoff}ms bekle (deneme ${retryCount + 1}/${MAX_RETRIES})`);
        await sleep(backoff);
        return fastParseDetailPage(page, job, retryCount + 1);
      }
      return { job, success: false };
    }

    const details = await page.evaluate(parseDetailFromDom);

    if (!details.description || details.description.length < 20) {
      return { job, success: false };
    }

    return {
      job: {
        ...job,
        title: details.detailTitle || job.title,
        company: details.detailCompany || job.company,
        description: details.description,
        requirements: details.requirements,
        seniorityLevel: details.seniorityLevel,
        employmentType: details.employmentType,
      },
      success: true,
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown';
    const isRetryable =
      message.includes('Execution context was destroyed') ||
      message.includes('ERR_HTTP_RESPONSE_CODE_FAILURE');

    if (isRetryable && retryCount < MAX_RETRIES) {
      const backoff = retryCount === 0 ? 3000 : 6000;
      logger.warn(`[RETRY] ${job.title.substring(0, 35)} — ${backoff}ms bekle (deneme ${retryCount + 1}/${MAX_RETRIES})`);
      await sleep(backoff);
      return fastParseDetailPage(page, job, retryCount + 1);
    }

    logger.warn(`[FAST] Detail hatası: ${job.title.substring(0, 40)}`, {
      error: message.substring(0, 80),
      retries: retryCount,
    });
    return { job, success: false };
  }
};

/** Detail sayfasından DOM verisi çeker — browser context'inde çalışır */
const parseDetailFromDom = () => {
  const descSelectors = [
    '.show-more-less-html__markup',
    '.description__text',
    '[class*="description"] .show-more-less',
    'article',
  ];

  let descEl: Element | null = null;
  for (const sel of descSelectors) {
    descEl = document.querySelector(sel);
    if (descEl) break;
  }

  const description = (descEl?.textContent ?? '').replace(/\s+/g, ' ').trim();

  const requirements: string[] = [];
  if (descEl) {
    descEl.querySelectorAll('li').forEach((li) => {
      const text = (li.textContent ?? '').trim();
      if (text.length > 5 && text.length < 500) {
        requirements.push(text);
      }
    });
  }

  const criteriaItems = document.querySelectorAll(
    '.description__job-criteria-item, [class*="job-criteria"] li',
  );

  let seniorityLevel: string | null = null;
  let employmentType: string | null = null;

  criteriaItems.forEach((item) => {
    const headerEl = item.querySelector('h3, .description__job-criteria-subheader');
    const valueEl = item.querySelector('span, .description__job-criteria-text');
    const header = (headerEl?.textContent ?? '').replace(/\s+/g, ' ').trim().toLowerCase();
    const value = (valueEl?.textContent ?? '').replace(/\s+/g, ' ').trim();

    if (header.includes('seniority')) seniorityLevel = value || null;
    if (header.includes('employment') || header.includes('type')) employmentType = value || null;
  });

  const titleEl = document.querySelector('.top-card-layout__title, h1');
  const detailTitle = (titleEl?.textContent ?? '').trim();

  const companyEl = document.querySelector(
    '.topcard__org-name-link, [class*="topcard"] a[class*="org"]',
  );
  const detailCompany = (companyEl?.textContent ?? '').trim();

  return { description, requirements, seniorityLevel, employmentType, detailTitle, detailCompany };
};

// ═══════════════════════════════════════════
// PARALEL BATCH FETCH
// ═══════════════════════════════════════════

/** Job detail'larını batch + paralel tab ile çeker */
const parallelFetchDetails = async (
  pool: PagePool,
  jobs: JobListing[],
  delayMin: number,
  delayMax: number,
): Promise<JobListing[]> => {
  const enriched: JobListing[] = [...jobs];
  const tabCount = pool.pages.length;
  const startTime = Date.now();
  let totalSuccess = 0;
  let totalFail = 0;

  const batchSize = tabCount;
  const batches = buildBatches(jobs.length, batchSize);

  logger.info(`[FAST] ${jobs.length} job → ${batches.length} batch (${batchSize} job/batch, ${tabCount} tab)`);

  let consecutiveFails = 0;

  for (let batchIdx = 0; batchIdx < batches.length; batchIdx++) {
    const batch = batches[batchIdx]!;
    const batchStart = Date.now();

    const batchPromises = batch.map(async (jobIndex, tabIndex) => {
      const page = pool.pages[tabIndex]!;
      const job = jobs[jobIndex]!;

      if (tabIndex > 0) {
        await sleep(tabIndex * 200);
      }

      const result = await fastParseDetailPage(page, job);
      enriched[jobIndex] = result.job;
      return result.success;
    });

    const results = await Promise.all(batchPromises);
    const batchSuccess = results.filter(Boolean).length;
    const batchFail = results.length - batchSuccess;
    totalSuccess += batchSuccess;
    totalFail += batchFail;

    const batchTime = ((Date.now() - batchStart) / 1000).toFixed(1);
    const progress = Math.min(batchIdx * batchSize + batch.length, jobs.length);

    logger.info(
      `  📦 Batch ${batchIdx + 1}/${batches.length}: ${batchSuccess}/${batch.length} başarılı (${batchTime}s) — Toplam: ${progress}/${jobs.length}`,
    );

    if (batchFail >= Math.ceil(batch.length * 0.6)) {
      consecutiveFails++;
    } else {
      consecutiveFails = 0;
    }

    if (consecutiveFails >= 2) {
      logger.warn(`[COOLDOWN] ${consecutiveFails} batch üst üste çoğunlukla hata — 8sn mola...`);
      await sleep(8000);
      consecutiveFails = 0;
    }

    if (batchIdx < batches.length - 1) {
      const batchDelay = randomBetween(Math.max(delayMin, 2000), Math.max(delayMax, 4000));
      logger.info(`  ⏳ Batch arası ${batchDelay}ms mola...`);
      await sleep(batchDelay);
    }
  }

  const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
  logger.success(`[FAST] Detay çekme tamamlandı`, {
    total: jobs.length,
    withDescription: totalSuccess,
    failed: totalFail,
    elapsed: `${elapsed}s`,
    batches: batches.length,
    tabCount,
  });

  return enriched;
};

/** Job index'lerini batch'lere böler */
const buildBatches = (totalJobs: number, batchSize: number): number[][] => {
  const batches: number[][] = [];
  for (let i = 0; i < totalJobs; i += batchSize) {
    const batch: number[] = [];
    for (let j = i; j < Math.min(i + batchSize, totalJobs); j++) {
      batch.push(j);
    }
    batches.push(batch);
  }
  return batches;
};

// ═══════════════════════════════════════════
// CONFIG LOADERS
// ═══════════════════════════════════════════

interface FastScraperConfig extends ScraperConfig {
  parallelTabs: number;
}

/** .env'den keyword listesini okur */
const loadKeywords = (): string[] => {
  const raw = process.env['KEYWORDS'];
  if (!raw || raw.trim().length === 0) {
    return ['Frontend Developer', 'React Developer'];
  }
  return raw.split(',').map((k) => k.trim()).filter((k) => k.length > 0);
};

/** .env'den location okur */
const loadLocation = (): string => process.env['LOCATION']?.trim() || 'Turkey';

/** .env'den fast scraper config yükler */
const loadFastConfig = (keywordCount: number): FastScraperConfig => {
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

/** Timestamp bazlı dosya adı üretir: job-YYYY-MM-DD-HH-MM.json */
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

/** Job listesine skill extraction ve salary parsing uygular */
const enrichJobsWithExtractors = (jobs: JobListing[]): JobListing[] =>
  jobs.map((job) => {
    const skills = extractSkills(job.title, job.description, job.requirements);
    const salaryParsed = parseSalary(job.salary) ?? extractSalaryFromDescription(job.description);
    return { ...job, skills, salaryParsed };
  });

// ═══════════════════════════════════════════
// ANA SERVİS
// ═══════════════════════════════════════════

@Injectable()
export class ScraperService {
  constructor(private readonly browserService: BrowserService) {}

  /**
   * Fast scrape çalıştırır — CLI entry point'ten çağrılır.
   *
   * Akış:
   * 1. Config yükle (.env)
   * 2. Browser aç (stealth)
   * 3. Search sayfalarını tara (keyword başına)
   * 4. Detail sayfalarını paralel çek (N tab)
   * 5. Skill extraction + salary parsing
   * 6. JSON dosyasına yaz
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

    // output/ root'ta kalıyor (debug/dev aracı)
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
    const mainSkillCount = jobs.reduce((sum, j) => sum + j.skills.filter((s) => s.isMain).length, 0);
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
      if (job.description) console.log(`     📝 ${job.description.substring(0, 150)}...`);
      if (job.requirements.length > 0) console.log(`     ✅ Gereksinimler (${job.requirements.length} madde)`);
      console.log(`     🔗 ${job.link}\n`);
    });
  }
}

/** Duplicate job'ları filtreler */
const deduplicateJobs = (
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
