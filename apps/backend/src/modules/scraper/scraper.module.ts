/**
 * Scraper Module — Ghost Scraper's NestJS module.
 *
 * This module hosts ALL scraping-related components:
 *
 * imports:
 *   - BullModule.registerQueue() → registers the 'scraper' queue with Redis
 *     Without this registration, @InjectQueue and @Processor will not work.
 *
 * controllers:
 *   - ScraperController → HTTP API: POST /scrape/trigger, GET /scrape/status/:id
 *
 * providers:
 *   - ScraperService → business logic (open browser, scrape, write to DB)
 *   - BrowserService → Playwright browser lifecycle
 *   - ScraperProcessor → BullMQ Worker (pulls from queue, hands to service)
 *   - ScraperEventListener → Queue event monitor (completed, failed, stalled)
 *
 * exports:
 *   - ScraperService → so the CLI and other modules can call it directly
 *
 * Wiring flow:
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
     * BullModule.registerQueue() — registers the 'scraper' queue.
     *
     * What does this call do?
     *   1. Creates data structures in Redis under the 'bull:scraper:*' key pattern
     *   2. Registers a Queue<ScrapeJobData, ScrapeJobResult> instance with NestJS DI
     *   3. @InjectQueue(QUEUE_NAMES.SCRAPER) works thanks to this registration
     *   4. @Processor(QUEUE_NAMES.SCRAPER) starts pulling jobs from this queue
     *
     * Where does the Redis connection come from?
     *   AppModule's BullModule.forRoot() → shared connection config
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
