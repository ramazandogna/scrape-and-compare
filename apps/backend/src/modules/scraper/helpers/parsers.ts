/**
 * LinkedIn DOM Parsers — extracts data from Search and Detail pages.
 *
 * Two main parsing strategies:
 * 1. Search Page: bulk-parses job cards from the list.
 * 2. Detail Page: pulls description, requirements, and level info for a single listing.
 *
 * Both parsers run inside page.evaluate() — i.e. in the BROWSER CONTEXT.
 * This means: no Node.js imports, console.log, etc. are usable.
 * Only vanilla DOM APIs are available (querySelector, textContent, etc.).
 *
 * Parallel Batch Fetch: pulls detail pages concurrently using N tabs.
 * Cooldown strategy: automatic pause on repeatedly failing batches.
 */

import type { Page } from 'playwright';
import type { JobListing } from '@scrape/shared';
import type { PagePool } from './resource';
import { classifyHttpError, classifyRuntimeError, adaptiveWait, calculateBatchCooldown } from './delay';
import { sleep, randomBetween, logger } from '@/utils/helpers';

// ═══════════════════════════════════════════
// SEARCH PAGE PARSER
// ═══════════════════════════════════════════

/**
 * Builds a LinkedIn search URL. The `start` parameter is used for pagination
 * (the LinkedIn guest API returns ~25 cards per page; start=0, 25, 50, ...).
 */
export const buildSearchUrl = (
  keyword: string,
  location: string,
  start: number = 0,
): string => {
  const params = new URLSearchParams({
    keywords: keyword,
    location,
  });
  if (start > 0) params.set('start', String(start));
  return `https://www.linkedin.com/jobs/search/?${params.toString()}`;
};

/**
 * Parses job cards from the search page.
 * Resource blocking must be enabled — the page loads in ~500ms.
 *
 * @param start LinkedIn pagination offset (0, 25, 50, ...)
 */
export const fastParseSearchPage = async (
  page: Page,
  keyword: string,
  location: string,
  start: number = 0,
): Promise<JobListing[]> => {
  const url = buildSearchUrl(keyword, location, start);
  logger.info(`[FAST] Aranıyor: "${keyword}" — ${location} (start=${start})`);

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

/** Captcha or AuthWall check */
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
 * Parses job cards from the DOM — runs inside page.evaluate.
 * This function runs in the browser context (Chromium V8), not in Node.js.
 *
 * Resilient selector strategy: 3-4 CSS selectors are tried for each element.
 * LinkedIn frequently changes class names — fallbacks protect us.
 */
const parseJobCardsFromDom = (scrapedAt: string): JobListing[] => {
  const results: JobListing[] = [];

  const extractUrl = (el: Element | null): string | null => {
    if (!el) return null;
    const fromDelayed = el.getAttribute('data-delayed-url');
    if (fromDelayed && fromDelayed.startsWith('http')) return fromDelayed;
    const fromSrc = el.getAttribute('src');
    if (fromSrc && fromSrc.startsWith('http')) return fromSrc;
    return null;
  };

  const readCardLogo = (card: Element): string | null => {
    // Filter out noise such as tracking pixels and emoji/avatar images.
    const isUsableImage = (url: string): boolean => {
      const lower = url.toLowerCase();
      if (lower.includes('ghost-person') || lower.includes('default-anonymous')) return false;
      if (lower.includes('emoji') || lower.includes('static.licdn.com/aero-v1')) return false;
      // licdn.com domain or company-logo path = LinkedIn company logo
      return (
        lower.includes('licdn.com') ||
        lower.includes('company-logo') ||
        lower.includes('media.licdn.com')
      );
    };

    const logoCandidates: Array<Element | null> = [
      card.querySelector('img[data-delayed-url*="company-logo"]'),
      card.querySelector('img[src*="company-logo"]'),
      card.querySelector('.artdeco-entity-image[data-delayed-url]'),
      card.querySelector('img[data-delayed-url*="licdn.com"]'),
      card.querySelector('img[src*="licdn.com"]'),
      card.querySelector('img[data-delayed-url][alt]'),
      card.querySelector('img[src][alt]'),
    ];

    for (const candidate of logoCandidates) {
      const logoUrl = extractUrl(candidate);
      if (logoUrl && isUsableImage(logoUrl)) return logoUrl;
    }

    return null;
  };

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
      const logoUrl = readCardLogo(card);

      if (!title || !company) return;

      const idFromUrl = link.match(/\/jobs\/view\/[^?]*?(\d{5,})/);
      const urnAttr = card.getAttribute('data-entity-urn') ?? '';
      const idFromUrn = urnAttr.match(/(\d{5,})/);
      const id = idFromUrl?.[1] ?? idFromUrn?.[1] ?? `unknown_${Date.now()}_${Math.random()}`;

      results.push({
        id,
        title,
        company,
        logoUrl,
        location: (locationEl?.textContent ?? '').trim() || 'Unknown',
        salary: (salaryEl?.textContent ?? '').trim() || null,
        salaryParsed: null,
        description: null,
        requirements: [],
        skills: [],
        seniorityLevel: null,
        employmentType: null,
        workType: null,
        link: link.startsWith('http') ? link : `https://www.linkedin.com${link}`,
        postedDate: (dateEl?.textContent ?? '').trim() || dateEl?.getAttribute('datetime') || null,
        scrapedAt,
      });
    } catch {
      // If a single card errors, continue with the rest
    }
  });

  return results;
};

// ═══════════════════════════════════════════
// PAGINATED SEARCH (Smart Target)
// ═══════════════════════════════════════════

/**
 * Walks consecutive pages for the same keyword until ~50 new listings are gathered.
 *
 * Each page in the LinkedIn guest API returns ~25 cards. A single page can drop to
 * 5–10 listings after dedup + time filter (r604800) — so we keep advancing the
 * `start` offset until the target is hit.
 *
 * Stopping conditions (first one wins):
 *   1. Collected unique listings >= target
 *   2. maxPages exhausted
 *   3. Page returned no cards (LinkedIn has run out of results for this keyword)
 *   4. Page showed a block/captcha
 *
 * Dedup is performed using `seenIds`/`seenLinks` sets shared by the caller.
 * This way a job found by multiple keywords is not counted twice.
 */
export const paginatedSearchScan = async (
  page: Page,
  keyword: string,
  location: string,
  options: PaginatedSearchOptions,
  seenIds: Set<string>,
  seenLinks: Set<string>,
): Promise<PaginatedSearchOutcome> => {
  const collected: JobListing[] = [];
  const startStep = options.startStep ?? 25;
  let pagesScanned = 0;
  let blocked = false;
  let exhausted = false;

  for (let pageIndex = 0; pageIndex < options.maxPages; pageIndex++) {
    const start = pageIndex * startStep;
    const pageJobs = await fastParseSearchPage(page, keyword, location, start);
    pagesScanned++;

    if (pageJobs.length === 0) {
      // Zero on the first page → likely block/captcha; we cannot expect
      // the next page to suddenly produce results, so break the loop.
      if (pageIndex === 0) blocked = true;
      else exhausted = true;
      break;
    }

    let newOnThisPage = 0;
    for (const job of pageJobs) {
      const isDupId = job.id.startsWith('unknown_') ? false : seenIds.has(job.id);
      const isDupLink = seenLinks.has(job.link);
      if (isDupId || isDupLink) continue;
      seenIds.add(job.id);
      seenLinks.add(job.link);
      collected.push(job);
      newOnThisPage++;
      if (collected.length >= options.target) break;
    }

    options.onPageFetched?.({
      keyword,
      pageIndex: pageIndex + 1,
      pagesScanned,
      collected: collected.length,
      target: options.target,
      newOnThisPage,
    });

    if (collected.length >= options.target) break;
    if (newOnThisPage === 0 && pageIndex >= 1) {
      // Produced no newly deduped listings → likely showing the same page
      // (LinkedIn pagination sometimes repeats). Do not waste time.
      exhausted = true;
      break;
    }
  }

  const targetReached = collected.length >= options.target;
  return { jobs: collected, pagesScanned, targetReached, exhausted, blocked };
};

export interface PaginatedSearchOptions {
  /** Target unique-listing count for this keyword (e.g. 50). */
  target: number;
  /** Maximum page count (to avoid hammering LinkedIn). */
  maxPages: number;
  /** LinkedIn pagination step — 25 in the guest API. */
  startStep?: number;
  /** Fires after each page is parsed for progress reporting. */
  onPageFetched?: (event: PaginatedSearchPageEvent) => void;
}

export interface PaginatedSearchPageEvent {
  keyword: string;
  pageIndex: number;
  pagesScanned: number;
  collected: number;
  target: number;
  newOnThisPage: number;
}

export interface PaginatedSearchOutcome {
  jobs: JobListing[];
  pagesScanned: number;
  targetReached: boolean;
  exhausted: boolean;
  blocked: boolean;
}

// ═══════════════════════════════════════════
// DETAIL PAGE PARSER
// ═══════════════════════════════════════════

/**
 * Parses a single job's detail page — with adaptive retry mechanism.
 *
 * Old behavior: fixed 3s/6s backoff, every error treated the same.
 * New behavior: HTTP status and error message are classified into a ScraperError,
 * each error type waits its own base delay × exponential + jitter.
 */
export const fastParseDetailPage = async (
  page: Page,
  job: JobListing,
  retryCount: number = 0,
): Promise<{ job: JobListing; success: boolean }> => {
  const label = job.title.substring(0, 35);

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
      const error = classifyHttpError(status, cleanUrl);
      const shouldRetry = await adaptiveWait(error, retryCount, label);
      if (shouldRetry) return fastParseDetailPage(page, job, retryCount + 1);
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
        logoUrl: details.detailLogoUrl || job.logoUrl,
        description: details.description,
        requirements: details.requirements,
        seniorityLevel: details.seniorityLevel,
        employmentType: details.employmentType,
        workType: details.workType,
      },
      success: true,
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown';
    const error = classifyRuntimeError(message);
    const shouldRetry = await adaptiveWait(error, retryCount, label);

    if (shouldRetry) return fastParseDetailPage(page, job, retryCount + 1);

    logger.warn(`[FAST] Detail hatası: ${label}`, {
      error: message.substring(0, 80),
      code: error.code,
      retries: retryCount,
    });
    return { job, success: false };
  }
};

/**
 * Extracts DOM data from the detail page — runs in the browser context.
 * Multi-selector strategy to survive LinkedIn's frequently changing class names.
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
  let workType: string | null = null;

  criteriaItems.forEach((item) => {
    const headerEl = item.querySelector('h3, .description__job-criteria-subheader');
    const valueEl = item.querySelector('span, .description__job-criteria-text');
    const header = (headerEl?.textContent ?? '').replace(/\s+/g, ' ').trim().toLowerCase();
    const value = (valueEl?.textContent ?? '').replace(/\s+/g, ' ').trim();

    if (header.includes('seniority')) seniorityLevel = value || null;
    if (header.includes('employment') || header.includes('type')) employmentType = value || null;
    if (header.includes('workplace') || header.includes('work type') || header.includes('location type')) workType = value || null;
  });

  // ── Fallback: extract seniority from description ──
  // On LinkedIn the criteria section can be empty for some listings.
  // If the description mentions "senior", "junior", "lead", catch it.
  if (!seniorityLevel && description) {
    const descLower = description.toLowerCase();
    if (/\b(senior|sr\.?|kıdemli)\b/i.test(descLower)) seniorityLevel = 'Senior';
    else if (/\b(junior|jr\.?|entry[\s-]?level)\b/i.test(descLower)) seniorityLevel = 'Junior';
    else if (/\b(mid[\s-]?senior|orta[\s-]?kıdemli)\b/i.test(descLower)) seniorityLevel = 'Mid-Senior level';
    else if (/\b(lead|principal|staff)\b/i.test(descLower)) seniorityLevel = 'Lead';
    else if (/\b(intern|stajyer)\b/i.test(descLower)) seniorityLevel = 'Internship';
  }

  // ── Fallback: extract workType from description ──
  // Terms like "Hibrit", "remote", "uzaktan" may appear in the description.
  if (!workType && description) {
    const descLower = description.toLowerCase();
    if (/\b(hibrit|hybrid)\b/i.test(descLower)) workType = 'Hybrid';
    else if (/\b(uzaktan|remote|fully[\s-]?remote)\b/i.test(descLower)) workType = 'Remote';
    else if (/\b(ofiste|on[\s-]?site|yerinde)\b/i.test(descLower)) workType = 'On-site';
  }

  // ── Fallback: extract employmentType from description ──
  if (!employmentType && description) {
    const descLower = description.toLowerCase();
    if (/\b(part[\s-]?time|yarı[\s-]?zamanlı)\b/i.test(descLower)) employmentType = 'Part-time';
    else if (/\b(full[\s-]?time|tam[\s-]?zamanlı)\b/i.test(descLower)) employmentType = 'Full-time';
    else if (/\b(contract|sözleşme(li)?|freelance)\b/i.test(descLower)) employmentType = 'Contract';
  }

  const titleEl = document.querySelector('.top-card-layout__title, h1');
  const detailTitle = (titleEl?.textContent ?? '').trim();

  const companyEl = document.querySelector(
    '.topcard__org-name-link, [class*="topcard"] a[class*="org"]',
  );
  const detailCompany = (companyEl?.textContent ?? '').trim();

  const logoCandidates = [
    document.querySelector('a[data-tracking-control-name="public_jobs_topcard_logo"] img[data-delayed-url]'),
    document.querySelector('a[data-tracking-control-name="public_jobs_topcard_logo"] img[src]'),
    document.querySelector('.top-card-layout__card img[data-delayed-url*="company-logo"]'),
    document.querySelector('.top-card-layout__card img[src*="company-logo"]'),
    document.querySelector('.sub-nav-cta__image[data-delayed-url*="company-logo"]'),
    document.querySelector('.sub-nav-cta__image[src*="company-logo"]'),
    document.querySelector('img[data-delayed-url*="company-logo"]'),
    document.querySelector('img[src*="company-logo"]'),
  ];

  let detailLogoUrl: string | null = null;
  for (const candidate of logoCandidates) {
    if (!candidate) continue;
    const delayed = candidate.getAttribute('data-delayed-url');
    if (delayed && delayed.startsWith('http')) {
      detailLogoUrl = delayed.replace(/&amp;/g, '&');
      break;
    }

    const src = candidate.getAttribute('src');
    if (src && src.startsWith('http')) {
      detailLogoUrl = src.replace(/&amp;/g, '&');
      break;
    }
  }

  return {
    description,
    requirements,
    seniorityLevel,
    employmentType,
    workType,
    detailTitle,
    detailCompany,
    detailLogoUrl,
  };
};

// ═══════════════════════════════════════════
// PARALLEL BATCH FETCH
// ═══════════════════════════════════════════

/**
 * Fetches job details in batches across parallel tabs.
 *
 * Strategy: N tabs → split into batches → each batch in parallel → cooldown check.
 * If 60%+ of a batch fails repeatedly, pauses for 8s (LinkedIn protection).
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
      const cooldown = calculateBatchCooldown(batchFail, batch.length);
      if (cooldown > 0) {
        logger.warn(`[COOLDOWN] ${consecutiveFails} batch üst üste çoğunlukla hata — ${(cooldown / 1000).toFixed(1)}sn mola...`);
        await sleep(cooldown);
      }
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

/** Splits job indices into batches */
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
