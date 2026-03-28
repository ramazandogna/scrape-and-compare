/**
 * Resource Blocker & Page Pool — Ağ optimizasyon katmanı.
 *
 * LinkedIn sayfalarından sadece HTML (document) yüklenmesini sağlar.
 * Stylesheet, image, font, script gibi gereksiz kaynaklar engellenir.
 * Tracking URL'leri (analytics, bot protection) bloklanır.
 *
 * PagePool: Paralel tab havuzu oluşturur — her tab'da resource blocking aktif.
 */

import type { BrowserContext, Page, Route } from 'playwright';
import type { BrowserService } from '../browser.service';
import { logger } from '@/utils/helpers';

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

/**
 * Page'e resource blocking uygular — sadece document HTML geçer.
 * Playwright route API'si ile her outgoing request intercept edilir.
 */
export const enableResourceBlocking = async (page: Page): Promise<void> => {
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

export interface PagePool {
  pages: Page[];
  close: () => Promise<void>;
}

/**
 * Paralel page pool oluşturur — her tab'da resource blocking aktif.
 * @param browserService Browser instance yöneticisi
 * @param context Playwright BrowserContext
 * @param size Kaç paralel tab açılacak
 */
export const createPagePool = async (
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
