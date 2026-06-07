/**
 * Scraper Processor — BullMQ Worker.
 *
 * This file is the bridge between the Redis queue and ScraperService.
 * It has NO business logic of its own — only:
 *   1. Pull a job from the queue (BullMQ does this automatically)
 *   2. Call ScraperService.runFastScrape(job.data)
 *   3. Return the result to Redis (BullMQ does this automatically)
 *
 * Why a separate file? Single Responsibility Principle:
 *   - ScraperService → "how to scrape?" (business logic)
 *   - ScraperProcessor → "how to consume from the queue?" (transport layer)
 *
 * What does the @Processor decorator do?
 *   1. NestJS registers this class as a BullMQ Worker
 *   2. Connects to Redis and listens to the QUEUE_NAMES.SCRAPER queue
 *   3. Calls the process() method when a job arrives
 *   4. If process() returns → job marked as COMPLETED
 *   5. If process() throws → job marked as FAILED
 *
 * What is WorkerHost?
 *   An abstract class from @nestjs/bullmq. Manages the Worker lifecycle:
 *   - Opening/closing the Redis connection
 *   - The job-fetch loop (polling)
 *   - Error handling and the retry mechanism
 *   You only implement the process() method.
 */

import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Injectable } from '@nestjs/common';
import type { Job } from 'bullmq';
import type { ScrapeJobData, ScrapeJobResult, ScrapeJobProgress } from '@scrape/shared';
import { QUEUE_NAMES } from '@scrape/shared';
import { ScraperService } from './scraper.service';
import { logger } from '@/utils/helpers';

// ═══════════════════════════════════════════
// PROCESSOR (WORKER)
// ═══════════════════════════════════════════

/**
 * BullMQ Worker — processes scrape jobs from the Redis queue.
 *
 * Generic types: Job<Data, Result>
 *   - Data = ScrapeJobData → type of job.data (keywords, location, config?)
 *   - Result = ScrapeJobResult → type of process()'s return value
 *
 * What does @Processor(QUEUE_NAMES.SCRAPER) mean?
 *   "This class listens to the queue named 'scraper'."
 *   QUEUE_NAMES.SCRAPER = 'scraper' — we use a constant instead of a magic string.
 */
@Injectable()
@Processor(QUEUE_NAMES.SCRAPER)
export class ScraperProcessor extends WorkerHost {
  constructor(
    private readonly scraperService: ScraperService,
  ) {
    super();
  }

  /**
   * Invoked by BullMQ whenever a job arrives.
   *
   * This method:
   *   - On return → job.returnvalue = return value, state = COMPLETED
   *   - On throw  → job.failedReason = error.message, state = FAILED
   *
   * @param job BullMQ Job object — access the payload via job.data and the unique ID via job.id
   * @returns ScrapeJobResult — ScrapeJobCompleted on success, throws on failure (BullMQ catches it)
   */
  async process(
    job: Job<ScrapeJobData, ScrapeJobResult>,
  ): Promise<ScrapeJobResult> {
    const { keywords, location } = job.data;

    logger.info(`[Queue] Job başlatılıyor: ${job.id}`, {
      jobId: job.id,
      keywords,
      location,
      attempt: job.attemptsMade + 1,
    });

    // Progress report: entering the SCANNING phase
    await this.reportProgress(job, {
      phase: 'SCANNING',
      message: `${keywords.length} keyword taranacak: ${keywords.join(', ')}`,
      percentage: 0,
    });

    try {
      // The real work happens here — ScraperService runs the entire scraping pipeline
      // Progress callback: reports progress to BullMQ at each phase
      const result = await this.scraperService.runFastScrape(
        job.data,
        (phase, message, percentage) => {
          void this.reportProgress(job, { phase, message, percentage });
        },
      );

      // Final progress report: done
      await this.reportProgress(job, {
        phase: 'EXTRACTING',
        message: `Tamamlandı: ${result.totalJobs} ilan, ${result.created} yeni`,
        percentage: 100,
      });

      logger.info(`[Queue] Job tamamlandı: ${job.id}`, {
        jobId: job.id,
        totalJobs: result.totalJobs,
        created: result.created,
        updated: result.updated,
        durationMs: result.durationMs,
        auditId: result.auditId,
      });

      return result;
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown error';

      logger.error(`[Queue] Job başarısız: ${job.id}`, {
        jobId: job.id,
        error: message,
        attempt: job.attemptsMade + 1,
      });

      // Throwing causes BullMQ to mark the job as FAILED
      // If retry is configured, it will automatically retry
      throw err;
    }
  }

  /**
   * Wrapper for job.updateProgress() — type-safe progress reporting.
   *
   * BullMQ's updateProgress() accepts `number | object`.
   * We always send an object typed as ScrapeJobProgress.
   */
  private async reportProgress(
    job: Job<ScrapeJobData, ScrapeJobResult>,
    progress: ScrapeJobProgress,
  ): Promise<void> {
    await job.updateProgress(progress);
  }
}
