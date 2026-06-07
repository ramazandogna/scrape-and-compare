/**
 * Resource Blocker & Page Pool — network optimization layer.
 *
 * Ensures only HTML (document) is loaded from LinkedIn pages.
 * Stylesheet, image, font, script and similar unneeded resources are blocked.
 * Tracking URLs (analytics, bot protection) are blocked.
 *
 * PagePool: creates a parallel tab pool — each tab has resource blocking enabled.
 */

import type { BrowserContext, Page, Route } from 'playwright';
import type { BrowserService } from '../browser.service';
import { logger } from '@/utils/helpers';

// ═══════════════════════════════════════════
// RESOURCE BLOCKER
// ═══════════════════════════════════════════

/** Blocked resource types — unnecessary for LinkedIn data */
const BLOCKED_RESOURCE_TYPES = new Set([
  'stylesheet', 'image', 'media', 'font', 'script',
  'texttrack', 'xhr', 'fetch', 'eventsource',
  'websocket', 'manifest', 'other',
]);

/** Blocked URL patterns — tracking, analytics, bot protection */
const BLOCKED_URL_PATTERNS = [
  'protechts.net', 'google-analytics', 'doubleclick',
  'facebook.com/tr', 'bat.bing.com', 'cdn.linkedin.com',
  'static.licdn.com', 'media.licdn.com', 'platform.linkedin.com',
];

/**
 * Applies resource blocking to the page — only document HTML passes through.
 * Every outgoing request is intercepted via Playwright's route API.
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
 * Creates a parallel page pool — each tab has resource blocking enabled.
 * @param browserService Browser instance manager
 * @param context Playwright BrowserContext
 * @param size Number of parallel tabs to open
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
        try { await page.close(); } catch { /* May already be closed */ }
      }
    },
  };
};
