/**
 * Browser Service — manages the Playwright browser in stealth mode.
 *
 * NestJS service version of the legacy browser.manager.ts.
 * Differences:
 * - @Injectable() → injected via DI, no need to `new` in the constructor
 * - onModuleDestroy → browser closes automatically when the NestJS app shuts down
 * - Same functionality: stealth plugin, random user-agent, random viewport
 *
 * Why a separate service? Single Responsibility:
 * ScraperService → "what to scrape" (business logic)
 * BrowserService → "how to open/close the browser" (infrastructure)
 */

import { Injectable, OnModuleDestroy } from '@nestjs/common';
import { chromium, type Browser, type BrowserContext, type Page } from 'playwright';
import type { ScraperConfig } from '@scrape/shared';
import { logger } from '@/utils/helpers';

/**
 * Loads the stealth plugin.
 * puppeteer-extra-plugin-stealth is compatible with playwright-extra.
 */
const loadStealthPlugin = async () => {
  const { default: StealthPlugin } = await import('puppeteer-extra-plugin-stealth');
  return StealthPlugin();
};

/** Realistic user-agent list — one is picked at random per session */
const USER_AGENTS = [
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Safari/605.1.15',
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:125.0) Gecko/20100101 Firefox/125.0',
  'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
];

/** Realistic viewport sizes */
const VIEWPORTS = [
  { width: 1920, height: 1080 },
  { width: 1440, height: 900 },
  { width: 1536, height: 864 },
  { width: 1366, height: 768 },
  { width: 1280, height: 720 },
];

const pickRandom = <T>(arr: T[]): T =>
  arr[Math.floor(Math.random() * arr.length)] as T;

@Injectable()
export class BrowserService implements OnModuleDestroy {
  private browser: Browser | null = null;

  /**
   * Safely close the browser when the NestJS app shuts down.
   * Triggered when app.close() is called in cli.ts.
   */
  async onModuleDestroy(): Promise<void> {
    await this.close();
  }

  /**
   * Creates a new browser instance and context.
   *
   * @param config Scraper configuration
   * @returns Browser context (used to open pages)
   */
  async launch(config: ScraperConfig): Promise<BrowserContext> {
    logger.info('Tarayıcı başlatılıyor...', {
      headless: config.headless,
      slowMo: config.slowMo,
    });

    try {
      const { chromium: stealthChromium } = await import('playwright-extra');
      const stealth = await loadStealthPlugin();
      stealthChromium.use(stealth);

      this.browser = await stealthChromium.launch({
        headless: config.headless,
        slowMo: config.slowMo,
        args: [
          '--disable-blink-features=AutomationControlled',
          '--disable-features=IsolateOrigins,site-per-process',
          '--no-sandbox',
        ],
      });

      logger.success('Stealth tarayıcı başlatıldı');
    } catch (err) {
      logger.warn('Stealth plugin yüklenemedi, vanilla Playwright kullanılıyor', {
        error: err instanceof Error ? err.message : 'Unknown error',
      });

      this.browser = await chromium.launch({
        headless: config.headless,
        slowMo: config.slowMo,
      });
    }

    const userAgent = pickRandom(USER_AGENTS);
    const viewport = pickRandom(VIEWPORTS);

    const context = await this.browser.newContext({
      userAgent,
      viewport,
      locale: 'en-US',
      timezoneId: 'Europe/Istanbul',
      geolocation: undefined,
      permissions: [],
      extraHTTPHeaders: {
        'Accept-Language': 'en-US,en;q=0.9,tr;q=0.8',
        'Accept-Encoding': 'gzip, deflate, br',
        'Sec-Fetch-Dest': 'document',
        'Sec-Fetch-Mode': 'navigate',
        'Sec-Fetch-Site': 'none',
        'Sec-Fetch-User': '?1',
        'Upgrade-Insecure-Requests': '1',
      },
    });

    logger.info('Browser context oluşturuldu', {
      userAgent: userAgent.substring(0, 50) + '...',
      viewport: `${viewport.width}x${viewport.height}`,
    });

    return context;
  }

  /**
   * Opens a new page and applies anti-bot settings.
   */
  async createPage(context: BrowserContext): Promise<Page> {
    const page = await context.newPage();

    await page.addInitScript(() => {
      Object.defineProperty(navigator, 'webdriver', {
        get: () => undefined,
      });
    });

    return page;
  }

  /**
   * Safely closes the browser.
   */
  async close(): Promise<void> {
    if (!this.browser) return;

    try {
      await this.browser.close();
      logger.info('Tarayıcı kapatıldı');
    } catch (err) {
      logger.error('Tarayıcı kapatılırken hata', {
        error: err instanceof Error ? err.message : 'Unknown error',
      });
    } finally {
      this.browser = null;
    }
  }
}
