/**
 * Matcher Module — AI Scoring Engine'in NestJS modülü.
 *
 * Bu modül iş ilanlarını kullanıcı profiliyle eşleştirip puanlayan
 * tüm bileşenleri barındırır:
 *
 * imports:
 *   - BullModule.registerQueue() → 'matcher' kuyruğunu Redis'e kaydeder
 *     Bu kayıt olmadan @InjectQueue ve @Processor çalışmaz.
 *
 * controllers:
 *   - MatcherController → HTTP API: POST /matcher/score, GET /matcher/results/:userId
 *
 * providers:
 *   - GeminiService → Gemini API iletişim katmanı
 *   - MatcherService → Batch scoring iş mantığı
 *   - MatcherProcessor → BullMQ Worker (rate-limited, 10 RPM)
 *   - MatcherEventListener → Queue event monitor (completed, failed, stalled)
 *
 * Bağlantı akışı:
 *   Controller ──@InjectQueue──► Queue ──Redis──► Processor ──► MatcherService ──► GeminiService
 *                                                    ↕
 *                                           MatcherEventListener (Pub/Sub)
 */

import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { QUEUE_NAMES } from '@scrape/shared';
import { GeminiService } from './gemini.service';
import { MatcherService } from './matcher.service';
import { MatcherProcessor } from './matcher.processor';
import { MatcherEventListener } from './matcher.events';
import { MatcherController } from './matcher.controller';

@Module({
  imports: [
    /**
     * BullModule.registerQueue() — 'matcher' kuyruğunu kaydeder.
     *
     * Redis bağlantısını AppModule'deki BullModule.forRoot()'tan alır.
     * Rate limiting Worker tarafında yapılır (@Processor options.limiter).
     */
    BullModule.registerQueue({
      name: QUEUE_NAMES.MATCHER,
    }),
  ],
  controllers: [MatcherController],
  providers: [
    GeminiService,
    MatcherService,
    MatcherProcessor,
    MatcherEventListener,
  ],
  exports: [MatcherService],
})
export class MatcherModule {}
