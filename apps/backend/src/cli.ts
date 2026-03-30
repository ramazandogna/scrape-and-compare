/**
 * CLI Entry Point — NestJS Standalone Application.
 *
 * Bu dosya eski index.fast.ts'in yerini alır. Ama artık NestJS DI kullanır:
 * - ScraperService inject edilir (browser yönetimi, paralel tab)
 * - PrismaService inject edilir (DB'ye kaydet)
 * - NestJS lifecycle hook'ları çalışır (onModuleInit, onModuleDestroy)
 *
 * İki mod destekler:
 *
 * 1. Direct Mode (varsayılan):
 *    pnpm scrape
 *    → ScraperService.runFastScrape() direkt çağrılır
 *    → Sunucu gerekmez, standalone app açılır/kapanır
 *
 * 2. Queue Mode (--queue flag):
 *    pnpm scrape --queue
 *    → Job BullMQ kuyruğuna eklenir
 *    → Asenkron çalışır — sunucu (main.ts) Worker'ı çalıştırmalı
 *    → CLI hemen çıkar, işi Worker yapar
 *
 * NestJS Standalone App nedir?
 * NestFactory.createApplicationContext() — HTTP listener OLMADAN DI container'ı
 * bootstrap eder. Tüm @Injectable() servisler kullanılabilir ama HTTP port
 * dinlenmez. Script bitince app.close() ile temizlik yapılır.
 *
 * Çalıştırma:
 *   pnpm scrape          → Direct mode
 *   pnpm scrape --queue  → Queue mode
 */

import 'reflect-metadata';
import 'dotenv/config';
import { NestFactory } from '@nestjs/core';
import { getQueueToken } from '@nestjs/bullmq';
import type { Queue } from 'bullmq';
import { AppModule } from '@/app.module';
import { ScraperService } from '@/modules/scraper/scraper.service';
import { loadKeywords, loadLocation } from '@/modules/scraper/helpers';
import type { ScrapeJobData, ScrapeJobResult } from '@scrape/shared';
import { QUEUE_NAMES } from '@scrape/shared';
import { logger } from '@/utils/helpers';

/**
 * CLI argümanlarından --queue flag'ini kontrol eder.
 *
 * process.argv yapısı: ['node', 'cli.ts', ...args]
 * Basit flag kontrolü — ileride yargs/commander eklenebilir.
 */
const isQueueMode = (): boolean => process.argv.includes('--queue');

/**
 * Direct Mode — ScraperService'i doğrudan çağırır.
 *
 * Browser açar, scrape yapar, DB'ye yazar, kapanır.
 * Aynı process içinde senkron çalışır.
 */
const runDirect = async (app: Awaited<ReturnType<typeof NestFactory.createApplicationContext>>): Promise<void> => {
  const scraperService = app.get(ScraperService);

  const keywords = loadKeywords();
  const location = loadLocation();

  logger.info('[CLI] Direct mode — scrape başlatılıyor', { keywords, location });
  const result = await scraperService.runFastScrape({ keywords, location });

  logger.success('[CLI] Scrape tamamlandı', {
    totalJobs: result.totalJobs,
    created: result.created,
    updated: result.updated,
    durationMs: result.durationMs,
  });
};

/**
 * Queue Mode — Job'ı BullMQ kuyruğuna ekler.
 *
 * getQueueToken() ne yapar?
 * NestJS BullMQ entegrasyonunda her kuyruk DI'a `BullModule_<name>` token'ıyla kaydedilir.
 * getQueueToken(QUEUE_NAMES.SCRAPER) bu token'ı üretir, app.get() ile Queue instance'ı alınır.
 *
 * CLI hemen çıkar — işi Worker (main.ts process'inde) yapar.
 * Sonucu görmek için: GET /scrape/status/:jobId
 */
const runQueue = async (app: Awaited<ReturnType<typeof NestFactory.createApplicationContext>>): Promise<void> => {
  const queue = app.get<Queue<ScrapeJobData, ScrapeJobResult>>(getQueueToken(QUEUE_NAMES.SCRAPER));

  const keywords = loadKeywords();
  const location = loadLocation();

  logger.info('[CLI] Queue mode — job kuyruğa ekleniyor', { keywords, location });

  const job = await queue.add('scrape', { keywords, location }, {
    removeOnComplete: { count: 100 },
    removeOnFail: { count: 50 },
  });

  logger.success(`[CLI] Job kuyruğa eklendi: ${String(job.id)}`, {
    jobId: job.id,
    hint: `Durumu görmek için: GET /scrape/status/${String(job.id)}`,
  });
};

const run = async (): Promise<void> => {
  // Standalone App — HTTP listener olmadan DI container bootstrap
  const app = await NestFactory.createApplicationContext(AppModule, {
    logger: false, // NestJS'in kendi log'larını bastır, biz kendi logger'ımızı kullanıyoruz
  });

  try {
    if (isQueueMode()) {
      await runQueue(app);
    } else {
      await runDirect(app);
    }
  } finally {
    // Temizlik — browser kapat, connection'ları temizle
    await app.close();
  }
};

run().catch((err: unknown) => {
  logger.error('Kritik hata — CLI scraper çöktü', {
    error: err instanceof Error ? err.message : 'Unknown error',
    stack: err instanceof Error ? err.stack : undefined,
  });
  process.exit(1);
});
