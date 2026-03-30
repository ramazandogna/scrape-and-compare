/**
 * Main Entry Point — NestJS HTTP sunucusu.
 *
 * Bu dosya REST API endpoint'lerini sunar:
 * - POST /scrape/trigger — yeni scrape job'ı kuyruğa ekle
 * - GET /scrape/status/:jobId — job durumunu sorgula
 *
 * BullMQ Worker da bu process içinde çalışır:
 * - ScraperProcessor otomatik olarak Redis kuyruğunu dinlemeye başlar
 * - ScraperEventListener event'leri loglar
 *
 * İki mod:
 *   main.ts → HTTP sunucu + BullMQ Worker (aynı process)
 *   cli.ts  → Tek seferlik scrape (standalone, sunucu yok)
 *
 * Çalıştırma: pnpm dev (apps/backend)
 */

import 'reflect-metadata';
import 'dotenv/config';
import { NestFactory } from '@nestjs/core';
import { AppModule } from '@/app.module';
import { logger } from '@/utils/helpers';

const bootstrap = async (): Promise<void> => {
  const app = await NestFactory.create(AppModule, {
    logger: false,
  });

  const port = process.env['PORT'] ?? 3000;
  await app.listen(port);

  logger.success(`Backend çalışıyor: http://localhost:${String(port)}`);
  logger.info('BullMQ Worker aktif — Redis kuyruğu dinleniyor');
};

bootstrap().catch((err: unknown) => {
  logger.error('Backend başlatılamadı', {
    error: err instanceof Error ? err.message : 'Unknown error',
  });
  process.exit(1);
});
