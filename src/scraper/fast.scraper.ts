/**
 * Fast LinkedIn Scraper — Resource Blocking + Paralel Tab Pool
 *
 * 🎯 NEDEN BU DOSYA VAR?
 * Eski scraper sayfayı tam render eder: JS, CSS, image, font...
 * Ama LinkedIn SSR kullanıyor — tüm veri document HTML'inde!
 *
 * Kanıt (discover.ts analizi):
 * - Search: 28 job title, company, URL, URN → hepsi HTML'de
 * - Detail: Description (2984 char), criteria → hepsi HTML'de
 * - Light mode (no JS): 138KB, 555ms → aynı veri, 10x hızlı
 *
 * Strateji:
 * 1. JS/CSS/Image/Font/Media blokla → sadece document HTML yükle
 * 2. Search sayfasından job card'ları çek (tek request, ~500ms)
 * 3. Detail sayfalarını 5 paralel tab ile çek (5 job = ~600ms)
 * 4. Sonuç: Eskisi 40sn + 5dk detay → Yenisi ~15-20sn total
 *
 * ⚠️ page.evaluate hâlâ çalışır! Browser engine HTML'i parse edip DOM oluşturur.
 * JS engellenmesi sayfa scriptlerini durdurur, Playwright'ın kendi inject'i değil.
 */

import type { BrowserContext, Page, Route } from 'playwright';
import type { JobListing, ScraperConfig, ScraperResult, ScrapeQuery } from '@/models/job.model';
import { createBrowser, closeBrowser, createPage } from '@/scraper/browser.manager';
import { sleep, randomBetween, logger } from '@/utils/helpers';

// ═══════════════════════════════════════════
// RESOURCE BLOCKER
// ═══════════════════════════════════════════

/**
 * Engellenen resource tipleri — bunlar LinkedIn verisi için gereksiz.
 * Sadece 'document' tipi geçer.
 */
const BLOCKED_RESOURCE_TYPES = new Set([
  'stylesheet',
  'image',
  'media',
  'font',
  'script',
  'texttrack',
  'xhr',
  'fetch',
  'eventsource',
  'websocket',
  'manifest',
  'other',
]);

/**
 * Engellenen URL pattern'leri — tracking, analytics, bot protection
 */
const BLOCKED_URL_PATTERNS = [
  'protechts.net',      // PerimeterX bot protection
  'google-analytics',
  'doubleclick',
  'facebook.com/tr',
  'bat.bing.com',
  'cdn.linkedin.com',   // JS/CSS CDN
  'static.licdn.com',   // Static assets
  'media.licdn.com',    // Media (logo, image)
  'platform.linkedin.com', // Tracking pixel
];

/**
 * Page'e resource blocking uygular.
 * Sadece document (HTML) response'u geçer, geri kalan her şey engellenir.
 *
 * @param page Playwright Page instance
 */
const enableResourceBlocking = async (page: Page): Promise<void> => {
  await page.route('**/*', (route: Route) => {
    const resourceType = route.request().resourceType();
    const url = route.request().url();

    // Document tipi → geçir (HTML response)
    if (resourceType === 'document') {
      route.continue();
      return;
    }

    // Bilinen zararsız resource'lar? Hayır, hepsini blokla.
    // LinkedIn SSR olduğu için JS/CSS gereksiz.
    if (BLOCKED_RESOURCE_TYPES.has(resourceType)) {
      route.abort();
      return;
    }

    // URL pattern kontrolü
    const isBlocked = BLOCKED_URL_PATTERNS.some((pattern) => url.includes(pattern));
    if (isBlocked) {
      route.abort();
      return;
    }

    // Diğer tüm request'leri de geçir (redirect vs.)
    route.continue();
  });
};

// ═══════════════════════════════════════════
// PARALEL TAB POOL
// ═══════════════════════════════════════════

/**
 * Paralel page pool — aynı anda N tab açar.
 * Her tab'da resource blocking aktif.
 */
interface PagePool {
  /** Havuzdaki page'ler */
  pages: Page[];
  /** Tüm page'leri kapat */
  close: () => Promise<void>;
}

/**
 * Paralel page pool oluşturur.
 *
 * @param context Browser context
 * @param size Kaç tab açılacak
 * @returns PagePool instance
 */
const createPagePool = async (context: BrowserContext, size: number): Promise<PagePool> => {
  logger.info(`${size} paralel tab oluşturuluyor...`);

  const pages: Page[] = [];

  for (let i = 0; i < size; i++) {
    const page = await createPage(context);
    await enableResourceBlocking(page);
    pages.push(page);
  }

  logger.success(`${size} paralel tab hazır (resource blocking aktif)`);

  return {
    pages,
    close: async () => {
      for (const page of pages) {
        try {
          await page.close();
        } catch {
          // Zaten kapanmış olabilir
        }
      }
    },
  };
};

// ═══════════════════════════════════════════
// SEARCH SAYFASI PARSER (FAST)
// ═══════════════════════════════════════════

/**
 * LinkedIn search URL'i oluşturur — eski scraper ile aynı format.
 */
const buildSearchUrl = (keyword: string, location: string): string => {
  const params = new URLSearchParams({
    keywords: keyword,
    location: location,
    f_TPR: 'r604800',
    position: '1',
    pageNum: '0',
  });
  return `https://www.linkedin.com/jobs/search/?${params.toString()}`;
};

/**
 * Search sayfasından job card'larını parse eder — FAST VERSION.
 *
 * Resource blocking aktif olduğundan:
 * - Sayfa 500ms'de yüklenir (3sn yerine)
 * - JS çalışmaz ama DOM zaten SSR
 * - Scroll gerek yok (ilk 25 zaten HTML'de)
 *
 * @param page Resource-blocked page
 * @param keyword Arama kelimesi
 * @param location Lokasyon
 * @returns Job listesi (description hariç)
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

  // Captcha kontrolü
  const isBlocked = await page.evaluate(() => {
    const body = (document.body.textContent ?? '').toLowerCase();
    return (
      body.includes('captcha') ||
      body.includes('unusual activity') ||
      body.includes('verify you are a human') ||
      body.includes('authwall')
    );
  });

  if (isBlocked) {
    logger.error('[FAST] LinkedIn bizi engelledi! (Captcha/AuthWall)');
    return [];
  }

  // Job card'larını parse et — DOM zaten SSR ile geldi
  const now = new Date().toISOString();

  const jobs = await page.evaluate((scrapedAt: string) => {
    const results: Array<{
      id: string;
      title: string;
      company: string;
      location: string;
      salary: string | null;
      salaryParsed: null;
      description: string | null;
      requirements: string[];
      skills: never[];
      seniorityLevel: string | null;
      employmentType: string | null;
      link: string;
      postedDate: string | null;
      scrapedAt: string;
    }> = [];

    // Job card selector'ları — SSR HTML'de çalışanlar
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

        // ID extraction — URL, URN veya data-entity-urn
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
  }, now);

  logger.success(`[FAST] "${keyword}" → ${jobs.length} job card parse edildi (${loadTime}ms)`);
  return jobs;
};

// ═══════════════════════════════════════════
// DETAIL SAYFASI PARSER (FAST + PARALEL)
// ═══════════════════════════════════════════

/**
 * Tek bir job'un detail sayfasını parse eder — resource blocking aktif.
 *
 * JS engellendiği için "Show More" butonu çalışmaz.
 * AMA: SSR HTML zaten tam description'ı içeriyor (142KB, 2984+ char).
 *
 * Retry mekanizması:
 * - "Execution context destroyed" → LinkedIn redirect yapıyor, retry
 * - "ERR_HTTP_RESPONSE_CODE_FAILURE" → Rate limit, daha uzun bekle + retry
 * - Max 2 retry, exponential backoff (2sn, 5sn)
 *
 * @param page Resource-blocked page
 * @param job Zenginleştirilecek job
 * @param retryCount Kaçıncı deneme (0 = ilk)
 * @returns { job, success } — Güncellenmiş job ve başarılı olup olmadığı
 */
const fastParseDetailPage = async (
  page: Page,
  job: JobListing,
  retryCount: number = 0,
): Promise<{ job: JobListing; success: boolean }> => {
  const MAX_RETRIES = 2;

  try {
    // Temiz URL oluştur — tracking param'ları kaldır
    const cleanUrl = job.id.startsWith('unknown_')
      ? job.link.split('?')[0] ?? job.link
      : `https://www.linkedin.com/jobs/view/${job.id}`;

    const response = await page.goto(cleanUrl, {
      waitUntil: 'domcontentloaded',
      timeout: 10000,
    });

    // HTTP status kontrolü — 429 veya 4xx/5xx rate limit belirtisi
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

    // SSR HTML parse — JS gerekmez
    const details = await page.evaluate(() => {
      // Description
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

      // Requirements — <li> taglarından
      const requirements: string[] = [];
      if (descEl) {
        descEl.querySelectorAll('li').forEach((li) => {
          const text = (li.textContent ?? '').trim();
          if (text.length > 5 && text.length < 500) {
            requirements.push(text);
          }
        });
      }

      // Job criteria — seniority, type, industry
      const criteriaItems = document.querySelectorAll(
        '.description__job-criteria-item, [class*="job-criteria"] li'
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

      // Job title (detail sayfasından — bazen daha temiz)
      const titleEl = document.querySelector('.top-card-layout__title, h1');
      const detailTitle = (titleEl?.textContent ?? '').trim();

      // Company (detail sayfasından)
      const companyEl = document.querySelector(
        '.topcard__org-name-link, [class*="topcard"] a[class*="org"]'
      );
      const detailCompany = (companyEl?.textContent ?? '').trim();

      return {
        description,
        requirements,
        seniorityLevel,
        employmentType,
        detailTitle,
        detailCompany,
      };
    });

    // Eğer description çekilemezse orijinal job'u döndür
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
    const isRedirect = message.includes('Execution context was destroyed');
    const isHttpError = message.includes('ERR_HTTP_RESPONSE_CODE_FAILURE');

    // Retry edilebilir hatalar
    if ((isRedirect || isHttpError) && retryCount < MAX_RETRIES) {
      const backoff = retryCount === 0 ? 3000 : 6000;
      logger.warn(`[RETRY] ${isRedirect ? 'Redirect' : 'HTTP Error'} — ${job.title.substring(0, 35)} — ${backoff}ms bekle (deneme ${retryCount + 1}/${MAX_RETRIES})`);
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
 * Job detail'larını BATCH + PARALEL şekilde çeker.
 *
 * Strateji:
 * - Job'ları batch'lere böl (her batch = tab sayısı kadar job)
 * - Her batch'i paralel tab'larla çek
 * - Batch arası mola ver (LinkedIn rate limit'i atlatmak için)
 * - Üst üste 3+ hata gelirse "cooldown" modu: 8sn bekle
 *
 * Neden batch? LinkedIn ~20-25 request sonrası rate limit veriyor.
 * Batch arası 3-5sn mola verince limit aşılmıyor.
 *
 * @param pool Paralel page pool
 * @param jobs Detayları çekilecek job'lar
 * @param delayMin Request arası minimum bekleme (ms)
 * @param delayMax Request arası maximum bekleme (ms)
 * @returns Zenginleştirilmiş job listesi
 */
const parallelFetchDetails = async (
  pool: PagePool,
  jobs: JobListing[],
  delayMin: number,
  delayMax: number,
): Promise<JobListing[]> => {
  const enriched: JobListing[] = [...jobs]; // Başlangıçta orijinal verilerle doldur
  const tabCount = pool.pages.length;
  const startTime = Date.now();
  let totalSuccess = 0;
  let totalFail = 0;

  // Job'ları batch'lere böl — her batch = tab sayısı kadar
  const batchSize = tabCount;
  const batches: number[][] = [];
  for (let i = 0; i < jobs.length; i += batchSize) {
    const batch: number[] = [];
    for (let j = i; j < Math.min(i + batchSize, jobs.length); j++) {
      batch.push(j);
    }
    batches.push(batch);
  }

  logger.info(`[FAST] ${jobs.length} job → ${batches.length} batch (${batchSize} job/batch, ${tabCount} tab)`);

  let consecutiveFails = 0;

  for (let batchIdx = 0; batchIdx < batches.length; batchIdx++) {
    const batch = batches[batchIdx]!;
    const batchStart = Date.now();

    // Batch'teki her job'u bir tab'a ata ve paralel çalıştır
    const batchPromises = batch.map(async (jobIndex, tabIndex) => {
      const page = pool.pages[tabIndex]!;
      const job = jobs[jobIndex]!;

      // Tab'lar arası küçük stagger — aynı anda hepsi vurmaktan kaçın
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
      `  📦 Batch ${batchIdx + 1}/${batches.length}: ${batchSuccess}/${batch.length} başarılı (${batchTime}s) — Toplam: ${progress}/${jobs.length}`
    );

    // Rate limit detection — üst üste hata gelince cooldown
    if (batchFail >= Math.ceil(batch.length * 0.6)) {
      consecutiveFails++;
    } else {
      consecutiveFails = 0;
    }

    if (consecutiveFails >= 2) {
      logger.warn(`[COOLDOWN] ${consecutiveFails} batch üst üste çoğunlukla hata — 8sn mola...`);
      await sleep(8000);
      consecutiveFails = 0; // Reset
    }

    // Batch arası mola — son batch değilse
    if (batchIdx < batches.length - 1) {
      const batchDelay = randomBetween(
        Math.max(delayMin, 2000),
        Math.max(delayMax, 4000),
      );
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

// ═══════════════════════════════════════════
// ANA ORCHESTRATOR
// ═══════════════════════════════════════════

/**
 * Fast scraper konfigürasyonu — ek paralel tab ayarı
 */
export interface FastScraperConfig extends ScraperConfig {
  /** Paralel tab sayısı (default: 5) */
  parallelTabs: number;
}

/**
 * ANA FONKSİYON: LinkedIn'den hızlı iş ilanı çeker.
 *
 * Farklar (eski scraper'a göre):
 * | Özellik        | Eski Scraper      | Fast Scraper         |
 * |----------------|-------------------|----------------------|
 * | Resource       | Hepsi yüklenir    | Sadece HTML          |
 * | Sayfa yükleme  | ~3-5sn            | ~500ms               |
 * | Detay çekme    | Sıralı (1 tab)    | Paralel (N tab)      |
 * | Scroll         | 5-8 kez           | Yok (SSR zaten var)  |
 * | JS gerekliliği | Evet              | Hayır                |
 * | "Show More"    | Tıkla & bekle     | Gerekmez (SSR full)  |
 *
 * @param keywords Aranacak keywordler
 * @param location Lokasyon
 * @param config Fast scraper config
 * @returns Job listesi ve hatalar
 */
export const fastFetchJobs = async (
  keywords: string[],
  location: string,
  config: FastScraperConfig,
): Promise<{
  jobs: JobListing[];
  errors: Array<{ keyword: string; error: ScraperResult }>;
}> => {
  const totalStart = Date.now();

  // 1. Browser aç (stealth aktif — bot detection bypass hâlâ gerekli)
  const { browser, context } = await createBrowser(config);

  const allJobs: JobListing[] = [];
  const errors: Array<{ keyword: string; error: ScraperResult }> = [];
  const seenIds = new Set<string>();
  const seenLinks = new Set<string>();

  try {
    // ─── ADIM 1: Search sayfalarını çek (resource blocking ile) ───
    logger.info('\n🔍 ADIM 1: Search sayfaları taranıyor...');
    const searchPage = await createPage(context);
    await enableResourceBlocking(searchPage);

    for (const keyword of keywords) {
      // Keyword'ler arası bekleme
      if (keywords.indexOf(keyword) > 0) {
        const delay = randomBetween(config.requestDelayMin, config.requestDelayMax);
        logger.info(`Sonraki arama öncesi ${delay}ms bekleniyor...`);
        await sleep(delay);
      }

      const query: ScrapeQuery = {
        keyword,
        location,
        timestamp: new Date().toISOString(),
      };

      try {
        const jobs = await fastParseSearchPage(searchPage, keyword, location);

        // Duplicate filtrele
        const newJobs = jobs
          .slice(0, config.maxJobsPerKeyword)
          .filter((job) => {
            const isDupId = job.id.startsWith('unknown_') ? false : seenIds.has(job.id);
            const isDupLink = seenLinks.has(job.link);
            if (isDupId || isDupLink) return false;
            seenIds.add(job.id);
            seenLinks.add(job.link);
            return true;
          });

        allJobs.push(...newJobs);
        logger.info(`Toplam unique: ${allJobs.length}`);
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Unknown';
        errors.push({
          keyword,
          error: {
            status: 'error',
            error: { code: 'PARSING_FAILED', selector: 'search', html: message },
            query,
          },
        });
        logger.error(`"${keyword}" araması başarısız: ${message}`);
      }
    }

    await searchPage.close();

    // ─── ADIM 2: Detail sayfalarını paralel çek ───
    if (config.fetchDetails && allJobs.length > 0) {
      const jobsToEnrich = allJobs.slice(0, config.maxDetailFetch);

      logger.info(`\n📝 ADIM 2: ${jobsToEnrich.length} ilanın detayı ${config.parallelTabs} paralel tab ile çekilecek...`);

      const pool = await createPagePool(context, config.parallelTabs);

      const enriched = await parallelFetchDetails(
        pool,
        jobsToEnrich,
        config.requestDelayMin,
        config.requestDelayMax,
      );

      // Zenginleştirilmiş job'ları yerine koy
      for (let i = 0; i < enriched.length; i++) {
        if (enriched[i]) {
          allJobs[i] = enriched[i]!;
        }
      }

      await pool.close();
    }
  } finally {
    await closeBrowser(browser);
  }

  const totalElapsed = ((Date.now() - totalStart) / 1000).toFixed(1);
  logger.success(`\n⚡ Fast scrape tamamlandı: ${totalElapsed}s, ${allJobs.length} job`);

  return { jobs: allJobs, errors };
};
