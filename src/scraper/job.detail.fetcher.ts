/**
 * Job Detail Fetcher — Her ilanın detay sayfasından description & requirements çeker.
 *
 * 🎯 AMAÇ: Job card'larından sadece title/company gelir.
 * Detaylı bilgi (description, requirements, seniority) için
 * her ilanın /jobs/view/{id} sayfasını ziyaret ediyoruz.
 *
 * Strateji:
 * - Public job view sayfasını kullan (login gerekmez)
 * - Description HTML'ini text'e çevir
 * - Requirements listesini ayıkla
 * - Rate limiting: her job arası 1-3sn bekle
 */

import type { Page } from 'playwright';
import type { JobListing } from '@/models/job.model';
import { sleep, randomBetween, logger } from '@/utils/helpers';

/**
 * Detaylı iş ilanı — description ve requirements ile zenginleştirilmiş
 */
export interface JobDetails {
  /** Tam iş açıklaması (plain text) */
  description: string;
  /** Gereksinimler listesi — HTML'den: <li> öğeleri */
  requirements: string[];
  /** Seniority seviyesi (varsa) */
  seniorityLevel: string | null;
  /** İstihdam tipi — Full-time, Part-time, Contract */
  employmentType: string | null;
  /** Sektör */
  industry: string | null;
  /** İlan'ın toplam başvuru sayısı (varsa) */
  applicantCount: string | null;
}

/**
 * Tek bir iş ilanının detay sayfasından bilgi çeker.
 *
 * LinkedIn public job view URL: https://www.linkedin.com/jobs/view/{jobId}
 *
 * HTML yapısı (2026):
 * <div class="show-more-less-html__markup"> → Description gövdesi
 * <ul class="description__job-criteria-list"> → Seniority, Type, Industry
 *
 * @param page Playwright Page instance (reuse edilir)
 * @param job Detayları çekilecek iş ilanı
 * @returns Zenginleştirilmiş job details veya null (çekilemezse)
 */
export const fetchJobDetails = async (
  page: Page,
  job: JobListing,
): Promise<JobDetails | null> => {
  try {
    // Job URL'ini temizle — tracking parametrelerini kaldır
    const cleanUrl = extractCleanJobUrl(job.link, job.id);

    await page.goto(cleanUrl, {
      waitUntil: 'domcontentloaded',
      timeout: 15000,
    });

    // LinkedIn JS'inin render etmesini bekle
    await sleep(randomBetween(1500, 2500));

    // "Show more" butonu varsa description'ı genişlet (bazı ilanlarda gizli)
    await expandDescription(page);

    // Description & metadata çek
    // ⚠️ page.evaluate içinde NAMED fonksiyon tanımlamak yasak!
    // tsx (esbuild) __name helper ekler, browser context'te tanımlı değil.
    // Bu yüzden tüm logic inline olmalı.
    const details = await page.evaluate(() => {
      // ═══════════════════════════════════════
      // DESCRIPTION — birden fazla selector dene
      // ═══════════════════════════════════════
      const descriptionSelectors = [
        '.show-more-less-html__markup',
        '.description__text',
        '[class*="description"] .show-more-less',
        '.jobs-description__content',
        'article',
      ];

      let descriptionEl: Element | null = null;
      for (const sel of descriptionSelectors) {
        descriptionEl = document.querySelector(sel);
        if (descriptionEl) break;
      }

      const description = (descriptionEl?.textContent ?? '').replace(/\s+/g, ' ').trim();

      // ═══════════════════════════════════════
      // REQUIREMENTS — <li> elemanlarını topla
      // ═══════════════════════════════════════
      const requirements: string[] = [];
      if (descriptionEl) {
        descriptionEl.querySelectorAll('li').forEach((li) => {
          const text = (li.textContent ?? '').trim();
          if (text.length > 5 && text.length < 500) {
            requirements.push(text);
          }
        });
      }

      // ═══════════════════════════════════════
      // JOB CRITERIA — Seniority, Type, Industry
      // ═══════════════════════════════════════
      const criteriaItems = document.querySelectorAll(
        '.description__job-criteria-item, [class*="job-criteria"] li'
      );

      let seniorityLevel: string | null = null;
      let employmentType: string | null = null;
      let industry: string | null = null;

      criteriaItems.forEach((item) => {
        const headerEl = item.querySelector('h3, .description__job-criteria-subheader');
        const valueEl = item.querySelector('span, .description__job-criteria-text');
        const header = (headerEl?.textContent ?? '').replace(/\s+/g, ' ').trim().toLowerCase();
        const value = (valueEl?.textContent ?? '').replace(/\s+/g, ' ').trim();

        if (header.includes('seniority')) seniorityLevel = value || null;
        if (header.includes('employment') || header.includes('job function')) employmentType = value || null;
        if (header.includes('industr')) industry = value || null;
      });

      // Başvuru sayısı
      const applicantEl = document.querySelector(
        '.num-applicants__caption, [class*="applicant"], .jobs-unified-top-card__applicant-count'
      );
      const applicantCount = (applicantEl?.textContent ?? '').trim() || null;

      return {
        description,
        requirements,
        seniorityLevel,
        employmentType,
        industry,
        applicantCount,
      };
    });

    if (!details.description || details.description.length < 20) {
      logger.warn(`Description çekilemedi: ${job.title} @ ${job.company}`, {
        url: cleanUrl,
        descLength: details.description.length,
      });
      return null;
    }

    return details;
  } catch (err) {
    logger.error(`Job detay çekilemedi: ${job.title}`, {
      error: err instanceof Error ? err.message : 'Unknown',
      url: job.link,
    });
    return null;
  }
};

/**
 * LinkedIn URL'ini temizler — sadece job view kısmını bırakır.
 * Tracking parametreleri bot algılamayı kolaylaştırır.
 *
 * Giriş:  https://tr.linkedin.com/jobs/view/frontend-developer-at-company-4364577318?position=1&pageNum=0&...
 * Çıkış:  https://www.linkedin.com/jobs/view/4364577318
 */
const extractCleanJobUrl = (url: string, jobId: string): string => {
  // Eğer numeric ID'miz varsa direkt temiz URL oluştur
  if (jobId && !jobId.startsWith('unknown_')) {
    return `https://www.linkedin.com/jobs/view/${jobId}`;
  }

  // URL'den ID çıkarmayı dene
  const match = url.match(/\/jobs\/view\/[^?]*?(\d{5,})/);
  if (match?.[1]) {
    return `https://www.linkedin.com/jobs/view/${match[1]}`;
  }

  // Fallback: sadece query params'ları kaldır
  return url.split('?')[0] ?? url;
};

/**
 * "Show more" butonuna tıklar — description'un tamamını gösterir.
 * LinkedIn uzun description'ları kısaltır.
 */
const expandDescription = async (page: Page): Promise<void> => {
  try {
    const showMoreBtn = page.locator(
      'button.show-more-less-html__button--more, [class*="show-more"] button'
    ).first();

    if (await showMoreBtn.isVisible({ timeout: 2000 })) {
      await showMoreBtn.click();
      await sleep(500);
    }
  } catch {
    // Buton yoksa sorun değil
  }
};

/**
 * Birden fazla iş ilanının detaylarını toplu çeker.
 *
 * Rate limiting uygular: her ilan arası rastgele bekleme.
 * İlerleme loglar: "3/50 ilanın detayı çekildi..."
 *
 * @param page Playwright Page instance
 * @param jobs Detayları çekilecek iş ilanları
 * @param delayMin Minimum bekleme (ms)
 * @param delayMax Maximum bekleme (ms)
 * @returns Zenginleştirilmiş job listesi
 */
export const enrichJobsWithDetails = async (
  page: Page,
  jobs: JobListing[],
  delayMin: number = 1500,
  delayMax: number = 3500,
): Promise<JobListing[]> => {
  logger.info(`📝 ${jobs.length} ilanın detayları çekiliyor...`);

  const enriched: JobListing[] = [];
  let successCount = 0;
  let failCount = 0;

  for (let i = 0; i < jobs.length; i++) {
    const job = jobs[i]!;

    // İlerleme logu — her 5 job'da bir
    if (i > 0 && i % 5 === 0) {
      logger.info(`  📊 İlerleme: ${i}/${jobs.length} (başarılı: ${successCount}, hata: ${failCount})`);
    }

    const details = await fetchJobDetails(page, job);

    if (details) {
      enriched.push({
        ...job,
        description: details.description,
        requirements: details.requirements,
        seniorityLevel: details.seniorityLevel,
        employmentType: details.employmentType,
      });
      successCount++;
    } else {
      // Detay alınamazsa orijinal veriyi koru
      enriched.push(job);
      failCount++;
    }

    // Sonraki ilan öncesi bekle (rate limiting)
    if (i < jobs.length - 1) {
      await sleep(randomBetween(delayMin, delayMax));
    }
  }

  logger.success(`📝 Detay çekme tamamlandı`, {
    total: jobs.length,
    withDescription: successCount,
    failed: failCount,
  });

  return enriched;
};
