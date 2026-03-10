/**
 * Main Entry Point — NestJS HTTP sunucusu.
 *
 * Bu dosya gelecekte REST API endpoint'leri sunacak:
 * - POST /scrape — yeni scrape başlat
 * - GET /jobs — job listesi
 * - GET /matches/:userId — eşleşme sonuçları
 *
 * Şu an aktif kullanılmıyor, scraper CLI modunda çalışıyor (cli.ts).
 * Ama yapıyı hazır tutuyoruz — NestJS'in HTTP listener'ı dakikalar içinde aktif edilebilir.
 *
 * Çalıştırma: pnpm dev (apps/backend)
 */

import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { AppModule } from '@/app.module';

const bootstrap = async (): Promise<void> => {
  const app = await NestFactory.create(AppModule);

  const port = process.env['PORT'] ?? 3000;
  await app.listen(port);

  console.log(`🚀 Backend çalışıyor: http://localhost:${String(port)}`);
};

bootstrap().catch((err: unknown) => {
  console.error('❌ Backend başlatılamadı:', err);
  process.exit(1);
});
