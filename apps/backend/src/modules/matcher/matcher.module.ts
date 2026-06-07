/**
 * Matcher Module — NestJS module for the AI Scoring Engine.
 *
 * This module hosts all components that match job listings against
 * the user profile and score them:
 *
 * imports:
 *   - BullModule.registerQueue() → registers the 'matcher' queue with Redis
 *     Without this registration, @InjectQueue and @Processor don't work.
 *
 * controllers:
 *   - MatcherController → HTTP API: POST /matcher/score, GET /matcher/results/:userId
 *
 * providers:
 *   - GeminiService → Gemini API communication layer
 *   - MatcherService → batch scoring business logic
 *   - MatcherProcessor → BullMQ Worker (rate-limited, 10 RPM)
 *   - MatcherEventListener → queue event monitor (completed, failed, stalled)
 *
 * Wiring flow:
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
     * BullModule.registerQueue() — registers the 'matcher' queue.
     *
     * Picks up the Redis connection from BullModule.forRoot() in AppModule.
     * Rate limiting is handled on the Worker side (@Processor options.limiter).
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
