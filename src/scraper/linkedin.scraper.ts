/**
 * LinkedIn Job Scraper — Public jobs sayfasından iş ilanı çeker.
 *
 * Strateji:
 * 1. linkedin.com/jobs/search?keywords=X&location=Y URL'ine git
 * 2. Sayfa yüklenene kadar bekle
 * 3. Job card'larını parse et (title, company, location, link)
 * 4. Scroll yaparak daha fazla sonuç yükle (infinite scroll)
 * 5. Her card'ın detay sayfasına giderek description çek (opsiyonel)
 *
 * Neden login'siz? LinkedIn'in /jobs/search sayfası public.
 * İlk 25 sonucu login olmadan gösterir. Bu bizim POC için yeterli.
 */

import type { Page } from 'playwright';
import type { JobListing, ScraperResult, ScrapeQuery, ScraperConfig } from '@/models/job.model';
import { createBrowser, createPage, closeBrowser } from '@/scraper/browser.manager';
import { attachNetworkSniffer, saveSnifferResults } from '@/scraper/network.sniffer';
import { enrichJobsWithDetails } from '@/scraper/job.detail.fetcher';
import { sleep, randomBetween, logger } from '@/utils/helpers';

/**
 * LinkedIn job arama URL'ini oluşturur.
 *
 * LinkedIn URL parametreleri:
 * - keywords: Arama terimi (URL encoded)
 * - location: Şehir/ülke
 * - f_TPR: Zaman filtresi (r86400 = son 24 saat, r604800 = son 1 hafta)
 * - position: Sayfa offset
 * - pageNum: Sayfa numarası
 *
 * @param keyword Arama kelimesi
 * @param location Lokasyon
 * @returns Tam LinkedIn search URL'i
 */
const buildSearchUrl = (keyword: string, location: string): string => {
  const params = new URLSearchParams({
    keywords: keyword,
    location: location,
    f_TPR: 'r604800', // Son 1 hafta — daha taze ilanlar
    position: '1',
    pageNum: '0',
  });

  return `https://www.linkedin.com/jobs/search/?${params.toString()}`;
};

/**
 * LinkedIn job ID'sini URL'den parse eder.
 *
 * LinkedIn URL formatı: /jobs/view/1234567890
 * "1234567890" kısmı unique ID.
 *
 * @param url Job URL'i veya data-entity-urn attribute
 * @returns Job ID string
 */
const extractJobId = (url: string): string => {
  // URL'den: /jobs/view/1234567890
  const viewMatch = url.match(/\/jobs\/view\/(\d+)/);
  if (viewMatch?.[1]) return viewMatch[1];

  // data-entity-urn'den: urn:li:jobPosting:1234567890
  const urnMatch = url.match(/jobPosting:(\d+)/);
  if (urnMatch?.[1]) return urnMatch[1];

  // Hiçbiri eşleşmezse URL hash'i kullan
  return `unknown_${Date.now()}`;
};

/**
 * Sayfayı yavaşça aşağı kaydırır — insanı taklit eder.
 *
 * LinkedIn infinite scroll kullanır: sayfa sonuna gelince
 * yeni sonuçlar yüklenir. Ani scroll bot gibi görünür,
 * bu yüzden küçük adımlarla kaydırıyoruz.
 *
 * @param page Playwright Page instance
 * @param scrollCount Kaç kez scroll yapılacak
 */
const humanLikeScroll = async (page: Page, scrollCount: number = 3): Promise<void> => {
  for (let i = 0; i < scrollCount; i++) {
    // Her scroll'da farklı bir mesafe — insan davranışı
    const distance = randomBetween(300, 700);

    await page.evaluate((scrollDistance) => {
      window.scrollBy(0, scrollDistance);
    }, distance);

    // Scroll'lar arası rastgele bekleme
    await sleep(randomBetween(800, 2000));
  }
};

/**
 * "See more jobs" butonuna tıklar (varsa).
 * LinkedIn bazen sonuçları sayfalamak yerine buton gösterir.
 *
 * @param page Playwright Page instance
 * @returns Buton bulunup tıklandı mı
 */
const clickSeeMoreButton = async (page: Page): Promise<boolean> => {
  try {
    // LinkedIn'in "See more jobs" butonu
    const button = page.locator('button.infinite-scroller__show-more-button');
    if (await button.isVisible({ timeout: 2000 })) {
      await button.click();
      await sleep(randomBetween(1500, 3000));
      return true;
    }
  } catch {
    // Buton yoksa sorun yok, devam
  }
  return false;
};

/**
 * Tek bir sayfadaki tüm job card'larını parse eder.
 *
 * LinkedIn'in HTML yapısı:
 * <ul class="jobs-search__results-list">
 *   <li>
 *     <div class="base-card">
 *       <h3 class="base-search-card__title">Job Title</h3>
 *       <h4 class="base-search-card__subtitle">Company</h4>
 *       <span class="job-search-card__location">Location</span>
 *       <a href="/jobs/view/123">Link</a>
 *       <time>2 days ago</time>
 *     </div>
 *   </li>
 * </ul>
 *
 * ⚠️ Bu selector'lar değişebilir! LinkedIn HTML'ini sık günceller.
 * Bu yüzden birden fazla fallback stratejimiz var.
 *
 * @param page Playwright Page instance
 * @returns Parse edilen JobListing array'i
 */
const parseJobCards = async (page: Page): Promise<JobListing[]> => {
  const now = new Date().toISOString();

  // Strateji 1: CSS Selector ile parse
  // page.evaluate() → tarayıcının içinde JavaScript çalıştırır
  // DOM'a direkt erişim sağlar (Playwright'ın kendi API'si yerine)
  const jobs = await page.evaluate((scrapedAt: string) => {
    const results: Array<{
      id: string;
      title: string;
      company: string;
      location: string;
      salary: string | null;
      description: string | null;
      requirements: string[];
      seniorityLevel: string | null;
      employmentType: string | null;
      link: string;
      postedDate: string | null;
      scrapedAt: string;
    }> = [];

    // Job card'larını bul — birden fazla selector dene
    const cardSelectors = [
      '.jobs-search__results-list li',           // Public search sonuçları
      '.job-search-card',                        // Alternatif class
      '[data-tracking-control-name="public_jobs_jserp-result"]', // Data attribute
      '.base-card',                              // Genel card class'ı
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
        // Title — birden fazla selector dene
        const titleEl =
          card.querySelector('.base-search-card__title') ??
          card.querySelector('h3') ??
          card.querySelector('[class*="title"]');

        // Company
        const companyEl =
          card.querySelector('.base-search-card__subtitle') ??
          card.querySelector('h4') ??
          card.querySelector('[class*="subtitle"]');

        // Location
        const locationEl =
          card.querySelector('.job-search-card__location') ??
          card.querySelector('[class*="location"]');

        // Link
        const linkEl =
          card.querySelector('a.base-card__full-link') ??
          card.querySelector('a[href*="/jobs/view/"]') ??
          card.querySelector('a');

        // Posted date
        const dateEl =
          card.querySelector('time') ??
          card.querySelector('[class*="listed"]');

        // Salary (nadiren gösterilir public sayfada)
        const salaryEl =
          card.querySelector('[class*="salary"]') ??
          card.querySelector('[class*="compensation"]');

        const title = titleEl?.textContent?.trim();
        const company = companyEl?.textContent?.trim();
        const link = linkEl?.getAttribute('href') ?? '';

        // Title ve company yoksa bu geçerli bir card değil, atla
        if (!title || !company) return;

        // Job ID'yi URL'den çıkar
        // LinkedIn URL formatları:
        //   /jobs/view/1234567890?...
        //   /jobs/view/frontend-developer-at-company-1234567890?...
        // Son sayı grubu her zaman job ID'dir
        const idFromUrl = link.match(/\/jobs\/view\/[^?]*?(\d{5,})/);
        const idFromUrn = link.match(/jobPosting:(\d+)/);
        // data-entity-urn attribute olabilir
        const urnAttr = card.getAttribute('data-entity-urn') ?? '';
        const idFromAttr = urnAttr.match(/(\d{5,})/);
        const id = idFromUrl?.[1] ?? idFromUrn?.[1] ?? idFromAttr?.[1] ?? `unknown_${Date.now()}_${Math.random()}`;

        results.push({
          id,
          title,
          company,
          location: locationEl?.textContent?.trim() ?? 'Unknown',
          salary: salaryEl?.textContent?.trim() ?? null,
          description: null, // Description ayrı request gerektirir
          requirements: [],  // Detail fetcher ile doldurulacak
          seniorityLevel: null,
          employmentType: null,
          link: link.startsWith('http') ? link : `https://www.linkedin.com${link}`,
          postedDate: dateEl?.textContent?.trim() ?? dateEl?.getAttribute('datetime') ?? null,
          scrapedAt,
        });
      } catch {
        // Tek bir card parse edilemezse diğerlerine devam et
      }
    });

    return results;
  }, now);

  return jobs;
};

/**
 * Tek bir keyword için LinkedIn'den iş ilanlarını çeker.
 *
 * Akış:
 * 1. URL oluştur → sayfaya git
 * 2. Sayfanın yüklenmesini bekle
 * 3. Scroll yaparak daha fazla sonuç yükle
 * 4. Job card'larını parse et
 * 5. Duplicate'ları filtrele
 *
 * @param page Playwright Page instance
 * @param keyword Arama kelimesi
 * @param location Lokasyon
 * @param config Scraper konfigürasyonu
 * @returns ScraperResult (success/error discriminated union)
 */
export const scrapeKeyword = async (
  page: Page,
  keyword: string,
  location: string,
  config: ScraperConfig
): Promise<ScraperResult> => {
  const query: ScrapeQuery = {
    keyword,
    location,
    timestamp: new Date().toISOString(),
  };

  try {
    const url = buildSearchUrl(keyword, location);
    logger.info(`Aranıyor: "${keyword}" — ${location}`, { url });

    // Sayfaya git ve yüklenmesini bekle
    // waitUntil: 'domcontentloaded' → HTML parse edildiyse yeter
    // 'networkidle' → tüm request'ler bitene kadar bekler (daha yavaş)
    await page.goto(url, {
      waitUntil: 'domcontentloaded',
      timeout: 30000, // 30 saniye timeout
    });

    // LinkedIn'in JavaScript'inin çalışması için ekstra bekleme
    await sleep(randomBetween(2000, 4000));

    // İlk sonuçları kontrol et — sayfa doğru yüklendi mi?
    const pageTitle = await page.title();
    logger.info(`Sayfa yüklendi: "${pageTitle}"`);

    // Captcha veya block kontrolü
    const isBlocked = await page.evaluate(() => {
      const body = document.body.textContent?.toLowerCase() ?? '';
      return (
        body.includes('captcha') ||
        body.includes('unusual activity') ||
        body.includes('verify you are a human') ||
        body.includes('authwall')
      );
    });

    if (isBlocked) {
      logger.error('LinkedIn bizi engelledi! (Captcha/AuthWall)', { keyword });
      return {
        status: 'error',
        error: { code: 'CAPTCHA_DETECTED', url },
        query,
      };
    }

    // Scroll yaparak daha fazla sonuç yükle
    logger.info('Scroll yapılıyor — daha fazla sonuç yükleniyor...');
    await humanLikeScroll(page, 5);

    // "See more jobs" butonu varsa tıkla
    await clickSeeMoreButton(page);

    // Tekrar scroll
    await humanLikeScroll(page, 3);

    // Job card'larını parse et
    logger.info('Job card\'ları parse ediliyor...');
    const jobs = await parseJobCards(page);

    // Max limite göre kes
    const limitedJobs = jobs.slice(0, config.maxJobsPerKeyword);

    logger.success(
      `"${keyword}" için ${limitedJobs.length} iş ilanı bulundu`,
      { total: jobs.length, limited: limitedJobs.length }
    );

    return {
      status: 'success',
      data: limitedJobs,
      query,
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';

    // Hata tipini belirle
    if (message.includes('timeout') || message.includes('Timeout')) {
      return {
        status: 'error',
        error: { code: 'TIMEOUT', timeoutMs: 30000 },
        query,
      };
    }

    if (message.includes('net::') || message.includes('ECONNREFUSED')) {
      return {
        status: 'error',
        error: { code: 'NETWORK_ERROR', message },
        query,
      };
    }

    return {
      status: 'error',
      error: { code: 'PARSING_FAILED', selector: 'general', html: message },
      query,
    };
  }
};

/**
 * ANA FONKSİYON: Birden fazla keyword için LinkedIn'den iş ilanı çeker.
 *
 * Bu fonksiyon tüm süreci yönetir:
 * 1. Browser'ı aç (stealth mode)
 * 2. Her keyword için sırayla scrape et
 * 3. Tüm sonuçları birleştir
 * 4. Duplicate'ları ID bazlı filtrele
 * 5. Browser'ı kapat
 *
 * @param keywords Aranacak kelimeler dizisi ["Frontend", "React", ...]
 * @param location Lokasyon "Istanbul" gibi
 * @param config Scraper konfigürasyonu
 * @returns Tüm sonuçlar ve hatalar
 */
export const fetchJobs = async (
  keywords: string[],
  location: string,
  config: ScraperConfig
): Promise<{
  jobs: JobListing[];
  errors: Array<{ keyword: string; error: ScraperResult }>;
}> => {
  const { browser, context } = await createBrowser(config);
  const page = await createPage(context);

  // Network sniffer — LinkedIn'in arka plandaki API çağrılarını yakala
  // Bu sayede JSON API endpoint'lerini keşfedebiliriz
  const sniffer = attachNetworkSniffer(page);

  const allJobs: JobListing[] = [];
  const errors: Array<{ keyword: string; error: ScraperResult }> = [];
  const seenIds = new Set<string>();
  const seenLinks = new Set<string>();

  try {
    for (const keyword of keywords) {
      // Her keyword arası rastgele bekleme — rate limiting önlemi
      if (keywords.indexOf(keyword) > 0) {
        const delay = randomBetween(config.requestDelayMin, config.requestDelayMax);
        logger.info(`Sonraki arama öncesi ${delay}ms bekleniyor...`);
        await sleep(delay);
      }

      const result = await scrapeKeyword(page, keyword, location, config);

      if (result.status === 'success') {
        // Duplicate filtrele — ID veya link bazlı (aynı job birden fazla keyword'de çıkabilir)
        const newJobs = result.data.filter((job) => {
          const isDuplicateId = job.id.startsWith('unknown_') ? false : seenIds.has(job.id);
          const isDuplicateLink = seenLinks.has(job.link);
          if (isDuplicateId || isDuplicateLink) return false;
          seenIds.add(job.id);
          seenLinks.add(job.link);
          return true;
        });

        allJobs.push(...newJobs);
        logger.info(`Toplam unique iş ilanı: ${allJobs.length}`);
      } else {
        errors.push({ keyword, error: result });
        logger.error(`"${keyword}" araması başarısız`, {
          code: result.error.code,
        });
      }
    }

    // Description & requirements çek (config'de aktifse)
    if (config.fetchDetails && allJobs.length > 0) {
      const jobsToEnrich = allJobs.slice(0, config.maxDetailFetch);
      logger.info(`\n📝 İlk ${jobsToEnrich.length} ilanın detayları çekiliyor...`);

      const enrichedJobs = await enrichJobsWithDetails(
        page,
        jobsToEnrich,
        config.requestDelayMin,
        config.requestDelayMax,
      );

      // Zenginleştirilmiş job'ları geri yerleştir
      for (let i = 0; i < enrichedJobs.length; i++) {
        allJobs[i] = enrichedJobs[i]!;
      }
    }
  } finally {
    // Sniffer sonuçlarını kaydet — LinkedIn API keşfi için
    sniffer.stop();
    const captured = sniffer.getCaptured();
    if (captured.length > 0) {
      saveSnifferResults(captured, `linkedin-${keywords.join('-')}`);
    }

    // Her durumda browser'ı kapat — memory leak önle
    await closeBrowser(browser);
  }

  return { jobs: allJobs, errors };
};
