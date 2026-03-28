/**
 * Browser Service — Playwright tarayıcısını stealth modda yönetir.
 *
 * Eski browser.manager.ts'in NestJS servis versiyonu.
 * Farklar:
 * - @Injectable() → DI ile inject edilir, constructor'da new yapmaya gerek yok
 * - onModuleDestroy → NestJS uygulama kapanınca browser otomatik kapanır
 * - Aynı işlevsellik: stealth plugin, random user-agent, random viewport
 *
 * Neden ayrı servis? Single Responsibility:
 * ScraperService → "ne scrape edilecek" (iş mantığı)
 * BrowserService → "browser nasıl açılacak/kapanacak" (altyapı)
 */

import { Injectable, OnModuleDestroy } from '@nestjs/common';
import { chromium, type Browser, type BrowserContext, type Page } from 'playwright';
import type { ScraperConfig } from '@scrape/shared';
import { logger } from '@/utils/helpers';

/**
 * Stealth plugin'i yükler.
 * puppeteer-extra-plugin-stealth playwright-extra ile uyumlu.
 */
const loadStealthPlugin = async () => {
  const { default: StealthPlugin } = await import('puppeteer-extra-plugin-stealth');
  return StealthPlugin();
};

/** Gerçekçi user-agent listesi — her oturumda rastgele biri seçilir */
const USER_AGENTS = [
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Safari/605.1.15',
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:125.0) Gecko/20100101 Firefox/125.0',
  'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
];

/** Gerçekçi viewport boyutları */
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
   * NestJS uygulama kapanırken browser'ı güvenli şekilde kapat.
   * cli.ts'te app.close() çağrıldığında tetiklenir.
   */
  async onModuleDestroy(): Promise<void> {
    await this.close();
  }

  /**
   * Yeni bir browser instance ve context oluşturur.
   *
   * @param config Scraper konfigürasyonu
   * @returns Browser context (sayfa açmak için)
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
   * Yeni bir sayfa açar ve bot-koruması ayarlarını yapar.
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
   * Browser'ı güvenli şekilde kapatır.
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
