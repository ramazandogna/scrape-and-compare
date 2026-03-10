/**
 * Database Module — Prisma ORM entegrasyonu.
 *
 * Global modül olarak tanımlanmıştır — her modül ayrıca import etmek zorunda değil.
 * Tüm uygulama boyunca PrismaService'e erişim sağlar.
 *
 * Neden @Global()?
 * PrismaService hemen hemen her modülde kullanılacak:
 * - ScraperModule → audit log yaz, job'ları kaydet
 * - MatcherModule → user profile ve match sonuçları
 * - ParserModule → CV verisi kaydet
 *
 * Her birine tek tek `imports: [DatabaseModule]` yazmak yerine
 * bir kez global tanımlıyoruz. NestJS bunu tüm modüllere inject eder.
 *
 * Not: Global modüllerden kaçının diyor NestJS docs, ama DB servisi
 * bunun en meşru kullanım alanı.
 */

import { Global, Module } from '@nestjs/common';
import { PrismaService } from '@/database/prisma.service';

@Global()
@Module({
  providers: [PrismaService],
  exports: [PrismaService],
})
export class DatabaseModule {}
