/**
 * App Module — NestJS uygulamasının kök modülü.
 *
 * Bu modül diğer tüm modülleri import eder ve uygulamayı bir araya getirir.
 * NestJS'te her uygulama tam olarak bir root module'e sahiptir.
 *
 * BullModule.forRoot() → Tüm BullMQ queue'ları için tek Redis bağlantısı.
 * forRoot() pattern'ı: "Bu config uygulama genelinde geçerli, bir kez tanımla."
 * Tıpkı DatabaseModule'ün @Global() olması gibi — her modül ayrı bağlantı açmaz.
 *
 * REDIS_HOST/REDIS_PORT .env'den okunur, yoksa localhost:6379 default kullanılır.
 */

import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { DatabaseModule } from '@/database/database.module';
import { ScraperModule } from '@/modules/scraper/scraper.module';
import { JobsModule } from '@/modules/jobs/jobs.module';
import { MatcherModule } from '@/modules/matcher/matcher.module';

@Module({
  imports: [
    DatabaseModule,

    /**
     * BullModule.forRoot() — Redis bağlantı konfigürasyonu.
     *
     * Bu çağrı TÜM queue'lar için ortak Redis bağlantısını tanımlar.
     * Her BullModule.registerQueue() bu bağlantıyı paylaşır.
     * Ayrı bir ioredis instance yaratmana gerek yok — @nestjs/bullmq halleder.
     */
    BullModule.forRoot({
      connection: {
        host: process.env['REDIS_HOST'] ?? 'localhost',
        port: Number(process.env['REDIS_PORT'] ?? 6379),
      },
    }),

    ScraperModule,

    JobsModule,

    MatcherModule,
  ],
})
export class AppModule {}
