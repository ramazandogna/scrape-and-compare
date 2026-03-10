/**
 * App Module — NestJS uygulamasının kök modülü.
 *
 * Bu modül diğer tüm modülleri import eder ve uygulamayı bir araya getirir.
 * NestJS'te her uygulama tam olarak bir root module'e sahiptir.
 *
 * Şu an sadece ScraperModule aktif. İleride eklenecekler:
 * - DatabaseModule (Prisma entegrasyonu — Todo 9)
 * - ParserModule (Module B — CV/LLM parsing)
 * - MatcherModule (Module C — Job-User matching)
 */

import { Module } from '@nestjs/common';
import { DatabaseModule } from '@/database/database.module';
import { ScraperModule } from '@/scraper/scraper.module';

@Module({
  imports: [DatabaseModule, ScraperModule],
})
export class AppModule {}
