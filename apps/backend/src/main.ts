/**
 * Main Entry Point — NestJS HTTP sunucusu.
 *
 * Bu dosya REST API endpoint'lerini sunar:
 * - POST /api/scrape/trigger — yeni scrape job'ı kuyruğa ekle
 * - GET  /api/scrape/status/:jobId — job durumunu sorgula
 * - GET  /api/jobs — iş ilanlarını listele
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
import { GlobalExceptionFilter } from '@/filters/global-exception.filter';
import { logger } from '@/utils/helpers';

const bootstrap = async (): Promise<void> => {
  const app = await NestFactory.create(AppModule, {
    logger: false,
  });

  // Global prefix — tüm route'lar /api altında
  app.setGlobalPrefix('api');

  // CORS — Next.js frontend'in API'ye erişimi için
  app.enableCors({
    origin: process.env['CORS_ORIGIN'] ?? 'http://localhost:3001',
    methods: ['GET', 'POST', 'PATCH', 'DELETE', 'OPTIONS'],
    credentials: true,
  });

  // Global exception filter — tutarlı hata formatı
  app.useGlobalFilters(new GlobalExceptionFilter());

  const port = process.env['PORT'] ?? 3000;
  await app.listen(port);

  // --watch modunda Node.js SIGTERM ile süreci yeniden başlatır.
  // enableShutdownHooks olmadan HTTP server portu serbest bırakmaz
  // → bir sonraki başlatmada EADDRINUSE hatası alınır.
  app.enableShutdownHooks();

  // Node.js 18.2+ — tüm açık socket'ları kapatır, port hemen serbest kalır
  const httpServer = app.getHttpServer() as import('http').Server;
  const closeConnections = (): void => {
    if (typeof httpServer.closeAllConnections === 'function') {
      httpServer.closeAllConnections();
    }
  };

  process.once('SIGTERM', async () => {
    closeConnections();
    await app.close();
  });

  process.once('SIGINT', async () => {
    closeConnections();
    await app.close();
    process.exit(0);
  });

  logger.success(`Backend çalışıyor: http://localhost:${String(port)}/api`);
  logger.info('BullMQ Worker aktif — Redis kuyruğu dinleniyor');
};

bootstrap().catch((err: unknown) => {
  logger.error('Backend başlatılamadı', {
    error: err instanceof Error ? err.message : 'Unknown error',
  });
  process.exit(1);
});
