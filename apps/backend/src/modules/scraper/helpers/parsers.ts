/**
 * LinkedIn DOM Parsers — Search ve Detail sayfalarından veri çıkarma.
 *
 * İki ana parsing stratejisi:
 * 1. Search Page: Job card'larını listeden toplu parse eder.
 * 2. Detail Page: Tek bir ilanın açıklama, gereksinim, seviye bilgisini çeker.
 *
 * Her iki parser da page.evaluate() ile BROWSER CONTEXT'inde çalışır.
 * Bu demektir ki: Node.js import'ları, console.log, vs. kullanılamaz.
 * Sadece vanilla DOM API'leri geçerlidir (querySelector, textContent, vb.)
 *
 * Paralel Batch Fetch: Detail sayfalarını N tab ile eşzamanlı çeker.
 * Cooldown stratejisi: Üst üste hatalı batch'lerde otomatik mola.
 */

import type { Page } from 'playwright';
import type { JobListing } from '@scrape/shared';
import type { PagePool } from './resource';
import { sleep, randomBetween, logger } from '@/utils/helpers';

// ═══════════════════════════════════════════
// SEARCH PAGE PARSER
// ═══════════════════════════════════════════

/** LinkedIn search URL'i oluşturur */
export const buildSearchUrl = (keyword: string, location: string): string => {
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
 * Resource blocking aktif olmalı — sayfa ~500ms'de yüklenir.
 */
export const fastParseSearchPage = async (
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
export const isPageBlocked = async (page: Page): Promise<boolean> =>
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
 *
 * Resilient selector stratejisi: Her eleman için 3-4 CSS selector denenir.
 * LinkedIn sık sık class name değiştirir — fallback'ler bizi korur.
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

/**
 * Tek bir job'un detail sayfasını parse eder — retry mekanizmalı.
 * HTTP 4xx veya context destroyed hatalarında exponential backoff ile tekrar dener.
 */
export const fastParseDetailPage = async (
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

/**
 * Detail sayfasından DOM verisi çeker — browser context'inde çalışır.
 * LinkedIn'in sık değişen class name'lerine karşı multiple selector stratejisi.
 */
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

/**
 * Job detail'larını batch + paralel tab ile çeker.
 *
 * Strateji: N tab → batch'e böl → her batch paralel → cooldown kontrolü.
 * Üst üste %60+ hatalı batch olursa 8sn mola verir (LinkedIn koruması).
 */
export const parallelFetchDetails = async (
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
