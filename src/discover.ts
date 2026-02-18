/**
 * 🔬 LinkedIn HTML Keşif Script'i
 *
 * AMAÇ: LinkedIn sayfalarının HTML'inde gömülü JSON var mı?
 * Eğer varsa, browser'ı tam render etmeden sadece HTTP response'dan
 * veri çekebiliriz — 10x hız artışı demek!
 *
 * Kontrol edeceğimiz yerler:
 * 1. <script type="application/ld+json"> — Schema.org structured data (JobPosting)
 * 2. <script> içindeki window.__INITIAL_STATE__ veya benzeri global state
 * 3. <code> tag'leri içindeki JSON (LinkedIn bazen bunu kullanır)
 * 4. data-* attribute'lerinde JSON
 * 5. Response header'larında ilginç bir şey var mı
 */

import 'dotenv/config';
import { writeFileSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { Page, Response as PlaywrightResponse } from 'playwright';
import { createBrowser, createPage, closeBrowser } from '@/scraper/browser.manager';
import { sleep, randomBetween, logger } from '@/utils/helpers';
import type { ScraperConfig } from '@/models/job.model';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const OUTPUT_DIR = join(__dirname, '..', 'output', 'discovery');

const config: ScraperConfig = {
  headless: false,
  slowMo: 0,
  maxJobsPerKeyword: 5,
  requestDelayMin: 1000,
  requestDelayMax: 2000,
  fetchDetails: false,
  maxDetailFetch: 0,
};

/**
 * Sayfa HTML'inden gömülü JSON verilerini çıkarır
 */
const extractEmbeddedData = async (page: Page, label: string) => {
  logger.info(`\n${'═'.repeat(60)}`);
  logger.info(`🔬 Analiz ediliyor: ${label}`);
  logger.info(`${'═'.repeat(60)}`);

  const result = await page.evaluate(() => {
    const findings: Array<{
      type: string;
      selector: string;
      size: number;
      preview: string;
      data: unknown;
    }> = [];

    // ═══════════════════════════════════════
    // 1. JSON-LD — Schema.org structured data
    // LinkedIn JobPosting schema kullanır mı?
    // ═══════════════════════════════════════
    document.querySelectorAll('script[type="application/ld+json"]').forEach((el, i) => {
      const text = el.textContent ?? '';
      if (text.length > 10) {
        try {
          const parsed = JSON.parse(text);
          findings.push({
            type: 'JSON-LD',
            selector: `script[type="application/ld+json"]:nth(${i})`,
            size: text.length,
            preview: text.substring(0, 300),
            data: parsed,
          });
        } catch {
          findings.push({
            type: 'JSON-LD (invalid)',
            selector: `script[type="application/ld+json"]:nth(${i})`,
            size: text.length,
            preview: text.substring(0, 300),
            data: null,
          });
        }
      }
    });

    // ═══════════════════════════════════════
    // 2. Inline <script> tag'leri — global state
    // window.__INITIAL_STATE__, __NEXT_DATA__, etc.
    // ═══════════════════════════════════════
    const statePatterns = [
      '__INITIAL_STATE__',
      '__NEXT_DATA__',
      '__DATA__',
      'window._store',
      'initialData',
      'pageData',
      'jobPosting',
      'decoratedJobPosting',
      'ssrRenderTime',
    ];

    document.querySelectorAll('script:not([src]):not([type])').forEach((el, i) => {
      const text = el.textContent ?? '';
      for (const pattern of statePatterns) {
        if (text.includes(pattern)) {
          findings.push({
            type: `INLINE_SCRIPT (${pattern})`,
            selector: `script:nth(${i})`,
            size: text.length,
            preview: text.substring(0, 500),
            data: null, // Çok büyük olabilir, preview yeter
          });
        }
      }
    });

    // ═══════════════════════════════════════
    // 3. <code> tag'leri — LinkedIn bu trick'i kullanıyor!
    // LinkedIn bazen <code id="bpr-guid-xxx"> içinde JSON saklar
    // ═══════════════════════════════════════
    document.querySelectorAll('code').forEach((el, i) => {
      const text = el.textContent ?? '';
      if (text.length > 50 && (text.startsWith('{') || text.startsWith('['))) {
        try {
          const parsed = JSON.parse(text);
          findings.push({
            type: 'CODE_TAG_JSON',
            selector: `code:nth(${i}) id="${el.id}"`,
            size: text.length,
            preview: text.substring(0, 500),
            data: typeof parsed === 'object' ? Object.keys(parsed as Record<string, unknown>).slice(0, 20) : parsed,
          });
        } catch {
          findings.push({
            type: 'CODE_TAG_TEXT',
            selector: `code:nth(${i}) id="${el.id}"`,
            size: text.length,
            preview: text.substring(0, 200),
            data: null,
          });
        }
      }
    });

    // ═══════════════════════════════════════
    // 4. data-* attribute'ler & entity-urn'ler
    // ═══════════════════════════════════════
    const dataElements = document.querySelectorAll('[data-entity-urn], [data-tracking-id], [data-job-id]');
    const dataAttrs: Array<{ tag: string; attrs: Record<string, string> }> = [];
    dataElements.forEach((el) => {
      const attrs: Record<string, string> = {};
      for (const attr of el.attributes) {
        if (attr.name.startsWith('data-')) {
          attrs[attr.name] = attr.value;
        }
      }
      dataAttrs.push({ tag: el.tagName, attrs });
    });
    if (dataAttrs.length > 0) {
      findings.push({
        type: 'DATA_ATTRIBUTES',
        selector: '[data-entity-urn] etc.',
        size: JSON.stringify(dataAttrs).length,
        preview: JSON.stringify(dataAttrs.slice(0, 5)),
        data: dataAttrs.slice(0, 10),
      });
    }

    // ═══════════════════════════════════════
    // 5. Meta tag'ler — OG tags, description
    // ═══════════════════════════════════════
    const metaTags: Record<string, string> = {};
    document.querySelectorAll('meta[property], meta[name]').forEach((el) => {
      const key = el.getAttribute('property') ?? el.getAttribute('name') ?? '';
      const val = el.getAttribute('content') ?? '';
      if (key && val) metaTags[key] = val;
    });
    findings.push({
      type: 'META_TAGS',
      selector: 'meta[property|name]',
      size: JSON.stringify(metaTags).length,
      preview: JSON.stringify(metaTags).substring(0, 500),
      data: metaTags,
    });

    // ═══════════════════════════════════════
    // 6. Genel HTML istatistikleri
    // ═══════════════════════════════════════
    findings.push({
      type: 'HTML_STATS',
      selector: 'document',
      size: document.documentElement.outerHTML.length,
      preview: `Total HTML: ${(document.documentElement.outerHTML.length / 1024).toFixed(0)}KB, Scripts: ${document.querySelectorAll('script').length}, Links: ${document.querySelectorAll('a').length}`,
      data: {
        totalHtmlSize: document.documentElement.outerHTML.length,
        scriptCount: document.querySelectorAll('script').length,
        linkCount: document.querySelectorAll('a').length,
        codeTagCount: document.querySelectorAll('code').length,
        imgCount: document.querySelectorAll('img').length,
      },
    });

    return findings;
  });

  // Özet logla
  result.forEach((f) => {
    const icon = f.type.includes('JSON-LD') ? '🟢' :
                 f.type.includes('CODE_TAG_JSON') ? '🟡' :
                 f.type.includes('INLINE_SCRIPT') ? '🔵' :
                 f.type.includes('DATA_ATTR') ? '🟠' : '⚪';
    logger.info(`${icon} [${f.type}] ${(f.size / 1024).toFixed(1)}KB — ${f.selector}`);
    if (f.preview) {
      const preview = f.preview.substring(0, 120);
      logger.info(`   ${preview}${f.preview.length > 120 ? '...' : ''}`);
    }
  });

  return result;
};

/**
 * Response intercept — sayfa yüklenirken document response'u yakala
 */
const interceptDocumentResponse = async (page: Page, url: string): Promise<{
  html: string;
  headers: Record<string, string>;
  status: number;
  responseTime: number;
}> => {
  return new Promise((resolve) => {
    const startTime = Date.now();

    // İlk document response'u yakala
    const handler = async (response: PlaywrightResponse) => {
      const reqUrl = response.url();
      const resourceType = response.request().resourceType();

      if (resourceType === 'document' && reqUrl.includes(url.split('?')[0]!.slice(-20))) {
        page.removeListener('response', handler);
        try {
          const body = await response.body();
          resolve({
            html: body.toString('utf-8'),
            headers: response.headers(),
            status: response.status(),
            responseTime: Date.now() - startTime,
          });
        } catch {
          resolve({ html: '', headers: {}, status: 0, responseTime: Date.now() - startTime });
        }
      }
    };

    page.on('response', handler);
  });
};

// ═══════════════════════════════════════
// ANA FONKSİYON
// ═══════════════════════════════════════
const main = async () => {
  mkdirSync(OUTPUT_DIR, { recursive: true });

  const { browser, context } = await createBrowser(config);
  const page = await createPage(context);

  const allFindings: Record<string, unknown> = {};

  try {
    // ─────────────────────────────────────
    // TEST 1: Search sayfası
    // ─────────────────────────────────────
    const searchUrl = 'https://www.linkedin.com/jobs/search/?keywords=Frontend+Developer&location=Turkey&f_TPR=r604800';
    logger.info('\n🔍 TEST 1: Search sayfası yükleniyor...');

    // Document intercept başlat
    const interceptPromise = interceptDocumentResponse(page, searchUrl);
    await page.goto(searchUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });
    const searchResponse = await Promise.race([
      interceptPromise,
      sleep(5000).then(() => ({ html: '', headers: {}, status: 0, responseTime: 5000 })),
    ]);

    logger.info(`📡 Search document response: ${searchResponse.status}, ${(searchResponse.html.length / 1024).toFixed(0)}KB, ${searchResponse.responseTime}ms`);

    // Response HTML'inde JSON-LD var mı?
    if (searchResponse.html) {
      const jsonLdMatches = searchResponse.html.match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g);
      logger.info(`📋 Search HTML'de JSON-LD blokları: ${jsonLdMatches?.length ?? 0}`);

      if (jsonLdMatches) {
        jsonLdMatches.forEach((match, i) => {
          const content = match.replace(/<script type="application\/ld\+json">/, '').replace(/<\/script>/, '');
          try {
            const parsed = JSON.parse(content);
            logger.success(`✅ JSON-LD #${i}: ${JSON.stringify(parsed).substring(0, 200)}...`);
            allFindings[`search_jsonld_${i}`] = parsed;
          } catch {
            logger.warn(`JSON-LD #${i} parse edilemedi`);
          }
        });
      }

      // <code> tag'lerini raw HTML'den kontrol et
      const codeMatches = searchResponse.html.match(/<code[^>]*>([\s\S]*?)<\/code>/g);
      logger.info(`📋 Search HTML'de <code> tag'leri: ${codeMatches?.length ?? 0}`);

      // İlk büyük code tag'ini göster
      if (codeMatches) {
        const bigCodes = codeMatches.filter((c) => c.length > 200);
        logger.info(`📋 Büyük <code> tag'leri (>200B): ${bigCodes.length}`);
        bigCodes.slice(0, 3).forEach((c, i) => {
          const inner = c.replace(/<\/?code[^>]*>/g, '');
          logger.info(`  Code #${i}: ${(inner.length / 1024).toFixed(1)}KB — ${inner.substring(0, 100)}...`);
        });
      }
    }

    await sleep(2000);

    // DOM'dan da analiz yap (JS render sonrası)
    const searchFindings = await extractEmbeddedData(page, 'Search Page (DOM)');
    allFindings['search_page'] = searchFindings;

    // ─────────────────────────────────────
    // TEST 2: Job detay sayfası
    // ─────────────────────────────────────
    logger.info('\n\n🔍 TEST 2: Job detay sayfası yükleniyor...');

    // İlk job'un ID'sini al
    const firstJobLink = await page.evaluate(() => {
      const link = document.querySelector('a[href*="/jobs/view/"]');
      return link?.getAttribute('href') ?? '';
    });
    const jobIdMatch = firstJobLink.match(/(\d{5,})/);
    const jobId = jobIdMatch?.[1] ?? '4374771287';
    const jobUrl = `https://www.linkedin.com/jobs/view/${jobId}`;

    logger.info(`Job detay: ${jobUrl}`);

    const jobInterceptPromise = interceptDocumentResponse(page, jobUrl);
    await page.goto(jobUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });
    const jobResponse = await Promise.race([
      jobInterceptPromise,
      sleep(5000).then(() => ({ html: '', headers: {}, status: 0, responseTime: 5000 })),
    ]);

    logger.info(`📡 Job document response: ${jobResponse.status}, ${(jobResponse.html.length / 1024).toFixed(0)}KB, ${jobResponse.responseTime}ms`);

    // Job HTML'inde JSON-LD var mı?
    if (jobResponse.html) {
      const jsonLdMatches = jobResponse.html.match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g);
      logger.info(`📋 Job HTML'de JSON-LD blokları: ${jsonLdMatches?.length ?? 0}`);

      if (jsonLdMatches) {
        jsonLdMatches.forEach((match, i) => {
          const content = match.replace(/<script type="application\/ld\+json">/, '').replace(/<\/script>/, '');
          try {
            const parsed = JSON.parse(content);
            logger.success(`✅ JSON-LD #${i} KEYS: ${Object.keys(parsed as Record<string, unknown>).join(', ')}`);
            logger.success(`   Preview: ${JSON.stringify(parsed).substring(0, 300)}...`);
            allFindings[`job_jsonld_${i}`] = parsed;
          } catch {
            logger.warn(`JSON-LD #${i} parse edilemedi`);
          }
        });
      }

      // <code> tag'leri
      const codeMatches = jobResponse.html.match(/<code[^>]*>([\s\S]*?)<\/code>/g);
      logger.info(`📋 Job HTML'de <code> tag'leri: ${codeMatches?.length ?? 0}`);
    }

    await sleep(2000);

    // DOM analizi
    const jobFindings = await extractEmbeddedData(page, 'Job Detail Page (DOM)');
    allFindings['job_detail_page'] = jobFindings;

    // ─────────────────────────────────────
    // TEST 3: Network intercept — document response'u yakalayıp
    // sayfayı tam yüklemeden veri çekebilir miyiz?
    // ─────────────────────────────────────
    logger.info('\n\n🔍 TEST 3: Sadece document response ile veri çekme testi...');

    // Yeni bir page aç — resource'ları (CSS, JS, img) full olarak yükleme
    const lightPage = await context.newPage();

    // TÜM gereksiz resource'ları engelle — sadece document indir
    await lightPage.route('**/*', (route) => {
      const resourceType = route.request().resourceType();
      if (resourceType === 'document') {
        route.continue();
      } else {
        route.abort(); // CSS, JS, resim vs. engelle
      }
    });

    const lightStart = Date.now();
    let lightHtml = '';

    try {
      const resp = await lightPage.goto(jobUrl, { waitUntil: 'commit', timeout: 15000 });
      if (resp) {
        const body = await resp.body();
        lightHtml = body.toString('utf-8');
      }
    } catch {
      // commit'te timeout alabilir, ama HTML gelmiş olabilir
      lightHtml = await lightPage.content();
    }

    const lightTime = Date.now() - lightStart;
    logger.info(`⚡ Sadece document (no JS/CSS): ${(lightHtml.length / 1024).toFixed(0)}KB, ${lightTime}ms`);

    // Bu hafif HTML'de JSON-LD var mı?
    const lightJsonLd = lightHtml.match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g);
    logger.info(`📋 Light HTML'de JSON-LD: ${lightJsonLd?.length ?? 0}`);

    if (lightJsonLd) {
      lightJsonLd.forEach((match, i) => {
        const content = match.replace(/<script type="application\/ld\+json">/, '').replace(/<\/script>/, '');
        try {
          const parsed = JSON.parse(content) as Record<string, unknown>;
          const keys = Object.keys(parsed);
          logger.success(`✅ LIGHT JSON-LD #${i}: keys=[${keys.join(', ')}]`);
          logger.success(`   ${JSON.stringify(parsed).substring(0, 400)}...`);
          allFindings[`light_job_jsonld_${i}`] = parsed;
        } catch {
          logger.warn(`Light JSON-LD #${i} parse fail`);
        }
      });
    }

    // "noscript" içinde de embedded data olabilir
    const noscriptMatches = lightHtml.match(/<noscript>([\s\S]*?)<\/noscript>/g);
    logger.info(`📋 <noscript> blokları: ${noscriptMatches?.length ?? 0}`);

    await lightPage.close();

    // ─────────────────────────────────────
    // SONUÇLARI KAYDET
    // ─────────────────────────────────────
    writeFileSync(
      join(OUTPUT_DIR, `discovery_${Date.now()}.json`),
      JSON.stringify(allFindings, null, 2),
      'utf-8'
    );

    // Ham HTML'leri de kaydet (inceleme için)
    if (searchResponse.html) {
      writeFileSync(join(OUTPUT_DIR, 'search_page_raw.html'), searchResponse.html, 'utf-8');
    }
    if (jobResponse.html) {
      writeFileSync(join(OUTPUT_DIR, 'job_detail_raw.html'), jobResponse.html, 'utf-8');
    }
    if (lightHtml) {
      writeFileSync(join(OUTPUT_DIR, 'job_detail_light.html'), lightHtml, 'utf-8');
    }

    logger.success(`\n📁 Tüm keşif verileri kaydedildi: ${OUTPUT_DIR}`);

  } finally {
    await closeBrowser(browser);
  }
};

main().catch((err) => {
  logger.error('Discovery failed', {
    error: err instanceof Error ? err.message : 'Unknown',
  });
  process.exit(1);
});
