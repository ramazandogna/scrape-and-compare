/**
 * Scraper Controller — HTTP API endpoints.
 *
 * This file is the boundary with the outside world (frontend, Postman, curl).
 * It has NO business logic of its own — only:
 *   1. POST /scrape/trigger → add job to Queue, return jobId
 *   2. GET /scrape/status/:jobId → read job state from Redis, return it
 *
 * Why a separate Controller?
 *   - ScraperService → "how to scrape?" (business logic)
 *   - ScraperProcessor → "how to consume from the queue?" (queue transport)
 *   - ScraperController → "how to trigger via HTTP?" (HTTP transport)
 *   Each has a single responsibility (SRP).
 *
 * What does @InjectQueue(QUEUE_NAMES.SCRAPER) do?
 *   Asks NestJS DI for the Queue instance named 'scraper'.
 *   This Queue must have been registered via BullModule.registerQueue().
 *   Queue.add() pushes a job to Redis — the Worker picks it up automatically.
 *
 * Fire-and-Forget Pattern:
 *   POST /trigger returns immediately (< 1ms). Scraping runs in the background.
 *   The client polls GET /status/:id whenever it wants.
 *   HTTP 202 (Accepted) = "I received your request, processing it but not done yet."
 */

import {
  Controller,
  Post,
  Get,
  Body,
  Param,
  HttpCode,
  HttpStatus,
  NotFoundException,
} from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import type { Queue } from 'bullmq';
import type { ScrapeJobData, ScrapeJobResult, ScrapeJobProgress } from '@scrape/shared';
import { QUEUE_NAMES, scrapeJobDataSchema } from '@scrape/shared';
import { ZodValidationPipe } from '@/pipes/zod-validation.pipe';
import { CurrentUser } from '@/modules/auth/current-user.decorator';
import type { AuthenticatedUser } from '@/modules/auth/auth.types';
import { logger } from '@/utils/helpers';

// ═══════════════════════════════════════════
// RESPONSE TYPES
// ═══════════════════════════════════════════

/** POST /scrape/trigger response */
interface TriggerResponse {
  jobId: string;
  message: string;
}

/** GET /scrape/status/:jobId response */
interface StatusResponse {
  jobId: string;
  state: string;
  progress: ScrapeJobProgress | null;
  result: ScrapeJobResult | null;
  failedReason: string | null;
  timestamps: {
    createdAt: number | null;
    processedAt: number | null;
    finishedAt: number | null;
  };
}

// ═══════════════════════════════════════════
// CONTROLLER
// ═══════════════════════════════════════════

/**
 * @Controller('scrape') → All routes live under the /scrape prefix:
 *   POST /scrape/trigger
 *   GET  /scrape/status/:jobId
 */
@Controller('scrape')
export class ScraperController {
  constructor(
    /**
     * @InjectQueue(QUEUE_NAMES.SCRAPER) — get the Queue instance from DI.
     *
     * Generic types: Queue<Data, Result>
     *   - Data = ScrapeJobData → payload type sent via queue.add()
     *   - Result = ScrapeJobResult → type of job.returnvalue
     *
     * This Queue object is only used to ENQUEUE and QUERY jobs.
     * Processing jobs is the Processor's (Worker's) job — the Controller does not touch it.
     */
    @InjectQueue(QUEUE_NAMES.SCRAPER)
    private readonly scrapeQueue: Queue<ScrapeJobData, ScrapeJobResult>,
  ) {}

  /**
   * POST /scrape/trigger — enqueues a new scrape job.
   *
   * Why @HttpCode(202) instead of 200?
   *   HTTP 202 Accepted = "I received your request, ACCEPTED it, but have not processed it yet."
   *   HTTP 200 OK = "I processed your request, HERE IS THE RESULT."
   *   We do not scrape immediately — we enqueue. Hence 202.
   *
   * @param body ScrapeJobData — { keywords, location, config? }
   * @returns TriggerResponse — { jobId, message }
   */
  @Post('trigger')
  @HttpCode(HttpStatus.ACCEPTED)
  async trigger(
    // Pipe is bound to the parameter — method-level @UsePipes would break CurrentUser.
    @Body(new ZodValidationPipe(scrapeJobDataSchema)) body: ScrapeJobData,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<TriggerResponse> {
    // userId always comes from auth — any value in the body is overridden.
    const payload: ScrapeJobData = { ...body, userId: user.id };
    const job = await this.scrapeQueue.add('scrape', payload, {
      /**
       * removeOnComplete: drop completed jobs from Redis (memory savings).
       * Keep the last 100 completed jobs — needed for status queries.
       * removeOnFail: manage failed jobs the same way.
       */
      removeOnComplete: { count: 100 },
      removeOnFail: { count: 50 },
    });

    logger.info(`[Controller] Scrape job kuyruğa eklendi: ${job.id}`, {
      jobId: job.id,
      keywords: body.keywords,
      location: body.location,
    });

    return {
      jobId: job.id!,
      message: `Scrape job kuyruğa eklendi. Durum sorgusu: GET /scrape/status/${job.id}`,
    };
  }

  /**
   * GET /scrape/status/:jobId — queries job state.
   *
   * BullMQ Job states:
   *   - waiting:    in the queue (not yet picked up by a Worker)
   *   - active:     Worker is processing (scraping in progress)
   *   - completed:  finished successfully (result available)
   *   - failed:     errored (failedReason available)
   *   - delayed:    waiting for scheduled execution
   *   - unknown:    job not found in Redis (deleted or invalid ID)
   *
   * @param jobId BullMQ job ID (returned from POST /trigger)
   * @returns StatusResponse — current state, progress and result
   */
  @Get('status/:jobId')
  async status(@Param('jobId') jobId: string): Promise<StatusResponse> {
    const job = await this.scrapeQueue.getJob(jobId);

    if (!job) {
      throw new NotFoundException(
        `Job bulunamadı: ${jobId}. Silinmiş veya geçersiz ID olabilir.`,
      );
    }

    const state = await job.getState();

    return {
      jobId,
      state,
      progress: extractProgress(job.progress),
      result: state === 'completed' ? (job.returnvalue as ScrapeJobResult) : null,
      failedReason: state === 'failed' ? (job.failedReason ?? null) : null,
      timestamps: {
        createdAt: job.timestamp ?? null,
        processedAt: job.processedOn ?? null,
        finishedAt: job.finishedOn ?? null,
      },
    };
  }
}

// ═══════════════════════════════════════════
// HELPER
// ═══════════════════════════════════════════

/**
 * Converts a BullMQ progress object into a ScrapeJobProgress.
 *
 * job.progress: number | object | undefined
 * We always send a ScrapeJobProgress object (from the Processor).
 * But BullMQ also accepts numbers, so we guard defensively.
 */
function extractProgress(progress: unknown): ScrapeJobProgress | null {
  if (
    progress !== null &&
    progress !== undefined &&
    typeof progress === 'object' &&
    'phase' in progress
  ) {
    return progress as ScrapeJobProgress;
  }
  return null;
}
