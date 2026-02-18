/**
 * LinkedIn Network Sniffer — Sayfanın arka planda yaptığı API çağrılarını yakalar.
 *
 * 🎯 AMAÇ: LinkedIn'in HTML render yerine doğrudan JSON API'sinden veri çekebilir miyiz?
 *
 * Nasıl çalışır:
 * 1. Playwright'ın "route" API'sini kullanarak TÜM network request'leri dinler
 * 2. JSON response'ları yakalar ve dosyaya yazar
 * 3. Böylece LinkedIn'in iç API yapısını görebiliriz
 *
 * Bu bir "keşif" aracı — production scraper'a değil, geliştirme sürecine yardımcı olur.
 */

import { writeFileSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { Page, Response } from 'playwright';
import { logger } from '@/utils/helpers';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

/** Yakalanan bir network response'un yapısı */
interface CapturedResponse {
  /** Request URL */
  url: string;
  /** HTTP method (GET, POST, vs.) */
  method: string;
  /** HTTP status code (200, 403, vs.) */
  status: number;
  /** Content-Type header */
  contentType: string;
  /** Response body (JSON parse edilmişse obje, değilse string) */
  body: unknown;
  /** Response boyutu (byte) */
  size: number;
  /** Yakalanma zamanı */
  timestamp: string;
}

/**
 * Sayfadaki tüm API çağrılarını dinler ve döner.
 *
 * Playwright'ın page.on('response') event'ini kullanır.
 * LinkedIn sayfası yüklenirken arka planda yapılan XHR/fetch çağrılarını yakalar.
 *
 * @param page Dinlenecek Playwright Page instance
 * @returns Cleanup fonksiyonu ve yakalanan response'lara erişim
 */
export const attachNetworkSniffer = (page: Page): {
  getCaptured: () => CapturedResponse[];
  stop: () => void;
} => {
  const captured: CapturedResponse[] = [];

  /** İlgilendiğimiz URL pattern'leri — LinkedIn'in iç API'leri */
  const interestingPatterns = [
    '/voyager/api/',          // LinkedIn'in ana API'si (Voyager)
    '/jobs-guest/',           // Public job API
    '/jobs/search/',          // Job arama
    '/li/track',             // Tracking (bize lazım değil ama bilgi için)
    'graphql',               // GraphQL endpoint varsa
    '/api/',                 // Genel API çağrıları
  ];

  /** İlgilenmediğimiz pattern'ler (asset'ler, font'lar vs.) */
  const ignorePatterns = [
    '.js', '.css', '.png', '.jpg', '.gif', '.svg', '.woff', '.ttf',
    'analytics', 'tracking', 'beacon', 'pixel', 'ads', 'log',
    'static.licdn.com', 'media.licdn.com',
  ];

  const responseHandler = async (response: Response) => {
    try {
      const url = response.url();
      const contentType = response.headers()['content-type'] ?? '';

      // Asset'leri filtrele
      if (ignorePatterns.some((p) => url.toLowerCase().includes(p))) return;

      // Sadece JSON ve HTML response'ları yakala
      const isJson = contentType.includes('json');
      const isHtml = contentType.includes('html');
      const isInteresting = interestingPatterns.some((p) => url.includes(p));

      if (!isJson && !isHtml && !isInteresting) return;

      const status = response.status();
      const method = response.request().method();

      let body: unknown = null;
      let size = 0;

      try {
        const buffer = await response.body();
        size = buffer.length;

        const text = buffer.toString('utf-8');
        // JSON parse etmeyi dene
        try {
          body = JSON.parse(text);
        } catch {
          // JSON değilse sadece ilk 500 karakter
          body = text.substring(0, 500) + (text.length > 500 ? '...[truncated]' : '');
        }
      } catch {
        body = '[body could not be read]';
      }

      const entry: CapturedResponse = {
        url,
        method,
        status,
        contentType,
        body,
        size,
        timestamp: new Date().toISOString(),
      };

      captured.push(entry);

      // Önemli API çağrılarını logla
      if (isJson && size > 100) {
        const urlShort = url.length > 80 ? url.substring(0, 80) + '...' : url;
        logger.info(`🔍 [SNIFFER] ${method} ${status} ${urlShort}`, {
          size: `${(size / 1024).toFixed(1)}KB`,
          contentType,
        });
      }
    } catch {
      // Sniffer hata verse de scraper'ı durdurmamalı
    }
  };

  page.on('response', responseHandler);

  return {
    getCaptured: () => captured,
    stop: () => {
      page.removeListener('response', responseHandler);
    },
  };
};

/**
 * Yakalanan network verilerini dosyaya kayıt eder.
 *
 * @param captured Yakalanan response'lar
 * @param label Dosya adı etiketi (ör: "frontend-developer")
 */
export const saveSnifferResults = (captured: CapturedResponse[], label: string): void => {
  const outputDir = join(__dirname, '..', '..', 'output', 'network-captures');
  mkdirSync(outputDir, { recursive: true });

  const safeLabel = label.replace(/[^a-zA-Z0-9-]/g, '_').toLowerCase();
  const filename = `${safeLabel}_${Date.now()}.json`;
  const outputPath = join(outputDir, filename);

  // Sadece anlamlı response'ları kaydet (100 byte'dan büyük JSON'lar)
  const meaningful = captured.filter((c) =>
    c.size > 100 &&
    (c.contentType.includes('json') || c.url.includes('/voyager/') || c.url.includes('/jobs'))
  );

  const summary = {
    totalCaptured: captured.length,
    meaningfulResponses: meaningful.length,
    capturedAt: new Date().toISOString(),
    label,
    /** API endpoint'lerin özeti */
    endpoints: meaningful.map((c) => ({
      url: c.url,
      method: c.method,
      status: c.status,
      size: c.size,
      contentType: c.contentType,
      // Body'nin ilk seviyesini göster (obje ise key'leri)
      bodyKeys: typeof c.body === 'object' && c.body !== null
        ? Object.keys(c.body as Record<string, unknown>)
        : typeof c.body,
    })),
    /** Tam response'lar */
    responses: meaningful,
  };

  writeFileSync(outputPath, JSON.stringify(summary, null, 2), 'utf-8');
  logger.success(`Network capture kaydedildi: ${outputPath}`, {
    total: captured.length,
    meaningful: meaningful.length,
  });
};
