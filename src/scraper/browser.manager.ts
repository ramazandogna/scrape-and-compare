/**
 * Browser Manager — Playwright tarayıcısını stealth modda yönetir.
 *
 * Ne yapar:
 * 1. Chromium'u stealth plugin ile açar (bot algılama bypass)
 * 2. Gerçekçi bir browser context oluşturur (viewport, locale, timezone)
 * 3. Tarayıcıyı güvenli şekilde kapatır (memory leak önler)
 *
 * Neden ayrı modül? Browser lifecycle'ı (aç/kapat) scraping logic'inden
 * bağımsız olmalı. Bu sayede browser'ı test için de kullanabiliriz.
 */

import { chromium, type Browser, type BrowserContext, type Page } from 'playwright';
import type { ScraperConfig } from '@/models/job.model';
import { logger } from '@/utils/helpers';

/**
 * Stealth plugin'i yükler.
 *
 * playwright-extra-plugin-stealth şunları yapar:
 * - navigator.webdriver = undefined (normalde true olur headless'ta)
 * - Chrome runtime enjekte eder (bot'lar bunu atlıyor normalde)
 * - WebGL vendor/renderer bilgisini gerçekçi yapar
 * - Permissions query API'yi düzgün döndürür
 */
const loadStealthPlugin = async () => {
  // Dynamic import çünkü bu paketler ESM/CJS hybrid
  const { default: StealthPlugin } = await import('playwright-extra-plugin-stealth');
  return StealthPlugin();
};

/**
 * Gerçekçi user-agent listesi — her oturumda rastgele biri seçilir.
 * LinkedIn, tekrarlayan user-agent'ları flag'ler.
 */
const USER_AGENTS = [
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Safari/605.1.15',
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:125.0) Gecko/20100101 Firefox/125.0',
  'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
];

/**
 * Rastgele bir user-agent seçer
 */
const pickRandomUserAgent = (): string =>
  USER_AGENTS[Math.floor(Math.random() * USER_AGENTS.length)] as string;

/**
 * Gerçekçi viewport boyutları — farklı ekran çözünürlükleri
 */
const VIEWPORTS = [
  { width: 1920, height: 1080 },
  { width: 1440, height: 900 },
  { width: 1536, height: 864 },
  { width: 1366, height: 768 },
  { width: 1280, height: 720 },
];

const pickRandomViewport = () =>
  VIEWPORTS[Math.floor(Math.random() * VIEWPORTS.length)] as { width: number; height: number };

/**
 * Yeni bir browser instance ve context oluşturur.
 *
 * Context nedir? Browser içinde bir "profil" gibi düşün. Kendi cookie'leri,
 * storage'ı ve ayarları var. İşimiz bitince context'i kapatırız,
 * browser'ı yeniden açmamıza gerek kalmaz.
 *
 * @param config Scraper konfigürasyonu
 * @returns Browser ve BrowserContext tuple'ı
 */
export const createBrowser = async (
  config: ScraperConfig
): Promise<{ browser: Browser; context: BrowserContext }> => {
  logger.info('Tarayıcı başlatılıyor...', {
    headless: config.headless,
    slowMo: config.slowMo,
  });

  // Stealth plugin'i yükle
  // Not: playwright-extra'nın chromium.launch'ı
  // standart playwright ile aynı çalışıyor ama plugin desteği ekliyor
  let browser: Browser;

  try {
    const { chromium: stealthChromium } = await import('playwright-extra');
    const stealth = await loadStealthPlugin();
    stealthChromium.use(stealth);

    browser = await stealthChromium.launch({
      headless: config.headless,
      slowMo: config.slowMo,
      args: [
        '--disable-blink-features=AutomationControlled', // Automation flag'i kaldır
        '--disable-features=IsolateOrigins,site-per-process', // Cross-origin izolasyonu kapat
        '--no-sandbox', // Sandbox kapalı (container'da gerekebilir)
      ],
    });

    logger.success('Stealth tarayıcı başlatıldı');
  } catch (err) {
    // Stealth plugin yüklenemezse vanilla Playwright'a fallback
    logger.warn('Stealth plugin yüklenemedi, vanilla Playwright kullanılıyor', {
      error: err instanceof Error ? err.message : 'Unknown error',
    });

    browser = await chromium.launch({
      headless: config.headless,
      slowMo: config.slowMo,
    });
  }

  // Context — gerçekçi bir browser profil oluştur
  const userAgent = pickRandomUserAgent();
  const viewport = pickRandomViewport();

  const context = await browser.newContext({
    userAgent,
    viewport,
    locale: 'en-US',
    timezoneId: 'Europe/Istanbul',
    // Geolocation'ı kapatıyoruz — LinkedIn bunu kullanmaz ama önemli
    geolocation: undefined,
    permissions: [],
    // Extra HTTP headers — gerçek browser'ın gönderdiği header'lar
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

  return { browser, context };
};

/**
 * Yeni bir sayfa (tab) açar ve temel bot-koruması ayarlarını yapar.
 *
 * @param context Browser context
 * @returns Yeni bir Page instance
 */
export const createPage = async (context: BrowserContext): Promise<Page> => {
  const page = await context.newPage();

  // navigator.webdriver'ı override et
  // Bazı siteler bunu kontrol eder: if (navigator.webdriver) → bot!
  await page.addInitScript(() => {
    Object.defineProperty(navigator, 'webdriver', {
      get: () => undefined,
    });
  });

  return page;
};

/**
 * Browser'ı güvenli şekilde kapatır. Memory leak'i önler.
 *
 * @param browser Kapatılacak browser instance
 */
export const closeBrowser = async (browser: Browser): Promise<void> => {
  try {
    await browser.close();
    logger.info('Tarayıcı kapatıldı');
  } catch (err) {
    logger.error('Tarayıcı kapatılırken hata', {
      error: err instanceof Error ? err.message : 'Unknown error',
    });
  }
};
