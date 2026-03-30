/**
 * Scraper Module — Ghost Scraper'ın NestJS modülü.
 *
 * Bu modül scraping ile ilgili TÜM bileşenleri barındırır:
 *
 * imports:
 *   - BullModule.registerQueue() → 'scraper' kuyruğunu Redis'e kaydeder
 *     Bu kayıt olmazsa @InjectQueue ve @Processor çalışmaz.
 *
 * controllers:
 *   - ScraperController → HTTP API: POST /scrape/trigger, GET /scrape/status/:id
 *
 * providers:
 *   - ScraperService → İş mantığı (browser aç, tara, DB'ye yaz)
 *   - BrowserService → Playwright browser lifecycle
 *   - ScraperProcessor → BullMQ Worker (kuyruktan al, service'e ver)
 *   - ScraperEventListener → Queue event monitor (completed, failed, stalled)
 *
 * exports:
 *   - ScraperService → CLI ve diğer modüller doğrudan çağırabilsin
 *
 * Bağlantı akışı:
 *   Controller ──@InjectQueue──► Queue ──Redis──► Processor ──► ScraperService
 *                                                    ↕
 *                                           ScraperEventListener (Pub/Sub)
 */

import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { QUEUE_NAMES } from '@scrape/shared';
import { ScraperService } from './scraper.service';
import { BrowserService } from './browser.service';
import { ScraperProcessor } from './scraper.processor';
import { ScraperEventListener } from './scraper.events';
import { ScraperController } from './scraper.controller';

@Module({
  imports: [
    /**
     * BullModule.registerQueue() — 'scraper' kuyruğunu kaydeder.
     *
     * Bu çağrı ne yapar?
     *   1. Redis'te 'bull:scraper:*' key pattern'ında veri yapıları oluşturur
     *   2. NestJS DI'a Queue<ScrapeJobData, ScrapeJobResult> instance'ı kaydeder
     *   3. @InjectQueue(QUEUE_NAMES.SCRAPER) bu kayıt sayesinde çalışır
     *   4. @Processor(QUEUE_NAMES.SCRAPER) bu kuyruktan job almaya başlar
     *
     * Redis bağlantısını nereden alır?
     *   AppModule'deki BullModule.forRoot() → ortak connection config
     */
    BullModule.registerQueue({
      name: QUEUE_NAMES.SCRAPER,
    }),
  ],
  controllers: [ScraperController],
  providers: [
    ScraperService,
    BrowserService,
    ScraperProcessor,
    ScraperEventListener,
  ],
  exports: [ScraperService],
})
export class ScraperModule {}
