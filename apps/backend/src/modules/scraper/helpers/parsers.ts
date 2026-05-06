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
import { classifyHttpError, classifyRuntimeError, adaptiveWait, calculateBatchCooldown } from './delay';
import { sleep, randomBetween, logger } from '@/utils/helpers';

// ═══════════════════════════════════════════
// SEARCH PAGE PARSER
// ═══════════════════════════════════════════

/** LinkedIn search URL'i oluşturur */
export const buildSearchUrl = (keyword: string, location: string, start: number = 0): string => {
  const params = new URLSearchParams({
    keywords: keyword,
    location,
    start: String(start),
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
  maxPages: number,
  maxJobs: number,
): Promise<JobListing[]> => {
  logger.info(`[FAST] Aranıyor: "${keyword}" — ${location}`, {
    maxPages,
    maxJobs,
  });

  const collected: JobListing[] = [];
  const seenLinks = new Set<string>();
  const seenIds = new Set<string>();

  for (let pageIndex = 0; pageIndex < maxPages; pageIndex++) {
    const start = pageIndex * 25;
    const url = buildSearchUrl(keyword, location, start);
    const startedAt = Date.now();

    await page.goto(url, {
      waitUntil: 'domcontentloaded',
      timeout: 15000,
    });

    const loadTime = Date.now() - startedAt;
    logger.info(`[FAST] Sayfa yüklendi`, {
      keyword,
      pageIndex: pageIndex + 1,
      loadTime,
      start,
    });

    if (await isPageBlocked(page)) {
      logger.error('[FAST] LinkedIn bizi engelledi! (Captcha/AuthWall)');
      break;
    }

    const now = new Date().toISOString();
    const jobs = await page.evaluate(parseJobCardsFromDom, now);

    if (jobs.length === 0) {
      logger.info(`[FAST] "${keyword}" için daha fazla sonuç bulunamadı`, {
        pageIndex: pageIndex + 1,
      });
      break;
    }

    for (const job of jobs) {
      if (seenLinks.has(job.link) || seenIds.has(job.id)) continue;
      seenLinks.add(job.link);
      seenIds.add(job.id);
      collected.push(job);
      if (collected.length >= maxJobs) break;
    }

    if (collected.length >= maxJobs) {
      break;
    }

    if (jobs.length < 10) {
      logger.info(`[FAST] "${keyword}" için sonuç sonuna yaklaşıldı`, {
        pageIndex: pageIndex + 1,
        parsed: jobs.length,
      });
      break;
    }

    await sleep(randomBetween(350, 850));
  }

  logger.success(`[FAST] "${keyword}" → ${collected.length} unique job card parse edildi`);
  return collected;
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

  const extractUrl = (el: Element | null): string | null => {
    if (!el) return null;
    const fromDelayed = el.getAttribute('data-delayed-url');
    if (fromDelayed && fromDelayed.startsWith('http')) return fromDelayed;
    const fromSrc = el.getAttribute('src');
    if (fromSrc && fromSrc.startsWith('http')) return fromSrc;
    return null;
  };

  const readCardLogo = (card: Element): string | null => {
    const looksLikeCompanyLogo = (url: string): boolean => {
      const lower = url.toLowerCase();
      return lower.includes('company-logo') || lower.includes('media.licdn.com/dms/image');
    };

    const logoCandidates: Array<Element | null> = [
      card.querySelector('img[data-delayed-url*="company-logo"]'),
      card.querySelector('img[data-delayed-url][alt]'),
      card.querySelector('img[src][alt]'),
      card.querySelector('.artdeco-entity-image[data-delayed-url]'),
      card.querySelector('img[src*="company-logo"]'),
      card.querySelector('img[src*="licdn.com"]'),
      card.querySelector('img[data-delayed-url]'),
      card.querySelector('img[src]'),
    ];

    for (const candidate of logoCandidates) {
      const logoUrl = extractUrl(candidate);
      if (logoUrl && looksLikeCompanyLogo(logoUrl)) return logoUrl;
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
      // Tek card hata verirse diğerlerine devam
    }
  });

  return results;
};

// ═══════════════════════════════════════════
// DETAIL PAGE PARSER
// ═══════════════════════════════════════════

/**
 * Tek bir job'un detail sayfasını parse eder — adaptive retry mekanizmalı.
 *
 * Eski davranış: Sabit 3s/6s backoff, her hata aynı muamele.
 * Yeni davranış: HTTP status ve hata mesajı ScraperError'a sınıflandırılır,
 * her error tipi kendi base delay × exponential + jitter ile beklenir.
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

  // ── Fallback: Description'dan seniority çıkarma ──
  // LinkedIn'de bazı ilanlarda criteria bölümü boş olabiliyor.
  // İlan açıklamasında "senior", "junior", "lead" geçiyorsa yakala.
  if (!seniorityLevel && description) {
    const descLower = description.toLowerCase();
    if (/\b(senior|sr\.?|kıdemli)\b/i.test(descLower)) seniorityLevel = 'Senior';
    else if (/\b(junior|jr\.?|entry[\s-]?level)\b/i.test(descLower)) seniorityLevel = 'Junior';
    else if (/\b(mid[\s-]?senior|orta[\s-]?kıdemli)\b/i.test(descLower)) seniorityLevel = 'Mid-Senior level';
    else if (/\b(lead|principal|staff)\b/i.test(descLower)) seniorityLevel = 'Lead';
    else if (/\b(intern|stajyer)\b/i.test(descLower)) seniorityLevel = 'Internship';
  }

  // ── Fallback: Description'dan workType çıkarma ──
  // "Hibrit", "remote", "uzaktan" gibi terimler açıklamada geçebilir.
  if (!workType && description) {
    const descLower = description.toLowerCase();
    if (/\b(hibrit|hybrid)\b/i.test(descLower)) workType = 'Hybrid';
    else if (/\b(uzaktan|remote|fully[\s-]?remote)\b/i.test(descLower)) workType = 'Remote';
    else if (/\b(ofiste|on[\s-]?site|yerinde)\b/i.test(descLower)) workType = 'On-site';
  }

  // ── Fallback: Description'dan employmentType çıkarma ──
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
