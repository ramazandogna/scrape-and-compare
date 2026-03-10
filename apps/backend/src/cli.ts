/**
 * CLI Entry Point — NestJS Standalone Application.
 *
 * Bu dosya eski index.fast.ts'in yerini alır. Ama artık NestJS DI kullanır:
 * - ScraperService inject edilir (browser yönetimi, paralel tab)
 * - İleride PrismaService de inject edilecek (DB'ye kaydet)
 * - NestJS lifecycle hook'ları çalışır (onModuleInit, onModuleDestroy)
 *
 * Fark: main.ts → HTTP sunucusu açar, dinler, kapatılana kadar çalışır.
 *        cli.ts → Scrape yapar, sonuç üretir, kapanır. Sunucu açmaz.
 *
 * NestJS Standalone App nedir?
 * NestFactory.createApplicationContext() — HTTP listener OLMADAN DI container'ı
 * bootstrap eder. Tüm @Injectable() servisler kullanılabilir ama HTTP port
 * dinlenmez. Script bitince app.close() ile temizlik yapılır.
 *
 * Çalıştırma: pnpm scrape (apps/backend)
 */

import 'reflect-metadata';
import 'dotenv/config';
import { NestFactory } from '@nestjs/core';
import { AppModule } from '@/app.module';
import { ScraperService } from '@/scraper/scraper.service';
import { logger } from '@/utils/helpers';

const run = async (): Promise<void> => {
  // Standalone App — HTTP listener olmadan DI container bootstrap
  const app = await NestFactory.createApplicationContext(AppModule, {
    logger: false, // NestJS'in kendi log'larını bastır, biz kendi logger'ımızı kullanıyoruz
  });

  try {
    const scraperService = app.get(ScraperService);
    await scraperService.runFastScrape();
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
