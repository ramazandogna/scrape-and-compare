/**
 * Matcher Processor — BullMQ Worker (Rate-Limited).
 *
 * This file is the bridge between the Redis queue and MatcherService.
 * It has NO business logic of its own — only:
 *   1. Take a batch job from the queue (BullMQ does this automatically)
 *   2. Call MatcherService.scoreBatch(user, jobs)
 *   3. Return the result to Redis (BullMQ does this automatically)
 *
 * Rate Limiting:
 *   Gemini free tier = 15 RPM. We stay at 10 RPM (5 RPM headroom).
 *   The BullMQ Worker's `limiter` option handles this automatically:
 *   { max: 10, duration: 60000 } → "process max 10 jobs per minute"
 *   Remaining jobs wait in Redis and are processed when it's their turn.
 *
 * Difference from ScraperProcessor:
 *   - Scraper: opens a browser, crawls pages, writes to DB (heavy I/O)
 *   - Matcher: sends a prompt, receives JSON, writes to DB (light but rate-limited)
 *   Both follow the same pattern: extend WorkerHost, implement process().
 */

import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Injectable } from '@nestjs/common';
import type { Job } from 'bullmq';
import {
  QUEUE_NAMES,
  MATCHER_DEFAULTS,
} from '@scrape/shared';
import type {
  MatcherJobData,
  MatcherJobResult,
  MatcherJobProgress,
} from '@scrape/shared';
import { MatcherService } from './matcher.service';
import { logger } from '@/utils/helpers';

// ═══════════════════════════════════════════
// PROCESSOR (WORKER)
// ═══════════════════════════════════════════

/**
 * BullMQ Worker — processes matcher jobs from the Redis queue.
 *
 * Generic types: Job<MatcherJobData, MatcherJobResult>
 *   - MatcherJobData = { user, jobs[], batchIndex, totalBatches }
 *   - MatcherJobResult = { status: 'completed', scored, failed, ... } | { status: 'failed', ... }
 *
 * Rate Limiting:
 *   The limiter is configured in the Worker constructor.
 *   After each job BullMQ checks "how many jobs have I run this minute?".
 *   If the limit is exceeded, the next job is held.
 */
@Injectable()
@Processor(QUEUE_NAMES.MATCHER, {
  limiter: {
    max: Number(process.env['MATCHER_RATE_LIMIT'] ?? MATCHER_DEFAULTS.RATE_LIMIT_RPM),
    duration: 60_000,
  },
  /**
   * lockDuration: Worker's lock duration on a job (ms).
   *
   * Default: 30s → during Gemini 503 retries (3×30s = 90s) + fallback model retries (3×30s),
   * the lock expires → BullMQ thinks the job is "stalled" and re-enqueues it.
   *
   * 4 minutes (240s): primary model (3 retries × 30s = 90s) + fallback model (3 retries × 30s = 90s)
   * + API call time (~30s) + safety margin = enough.
   *
   * BullMQ auto-renews the lock at lockDuration/2 intervals (autorun heartbeat).
   */
  lockDuration: 240_000,
})
export class MatcherProcessor extends WorkerHost {
  constructor(
    private readonly matcherService: MatcherService,
  ) {
    super();
  }

  /**
   * Called by BullMQ for every incoming batch job.
   *
   * This method:
   *   - If it returns → the job is marked COMPLETED
   *   - If it throws → the job is marked FAILED (retried if configured)
   *
   * @param job BullMQ Job object — access MatcherJobData via job.data
   * @returns MatcherJobResult — success/failure result
   */
  async process(
    job: Job<MatcherJobData, MatcherJobResult>,
  ): Promise<MatcherJobResult> {
    const { user, jobs, batchIndex, totalBatches } = job.data;

    logger.info(
      {
        jobId: job.id,
        userId: user.id,
        batchIndex,
        totalBatches,
        jobCount: jobs.length,
        attempt: job.attemptsMade + 1,
      },
      `[MATCHER-WORKER] Batch ${String(batchIndex + 1)}/${String(totalBatches)} başlatılıyor`,
    );

    // Progress: entering SCORING phase
    await this.reportProgress(job, {
      phase: 'SCORING',
      message: `Batch ${String(batchIndex + 1)}/${String(totalBatches)}: ${String(jobs.length)} ilan puanlanıyor`,
      batchIndex,
      totalBatches,
      percentage: Math.round(((batchIndex) / totalBatches) * 100),
    });

    try {
      const result = await this.matcherService.scoreBatch(user, jobs);

      // Progress: entering SAVING phase
      await this.reportProgress(job, {
        phase: 'SAVING',
        message: `Batch ${String(batchIndex + 1)}/${String(totalBatches)}: ${String(result.scored.length)} sonuç kaydedildi`,
        batchIndex,
        totalBatches,
        percentage: Math.round(((batchIndex + 1) / totalBatches) * 100),
      });

      const avgScore = this.calculateAvgScore(result.scored.map((s) => s.score));

      logger.info(
        {
          jobId: job.id,
          userId: user.id,
          batchIndex,
          scored: result.scored.length,
          failed: result.failed.length,
          avgScore,
        },
        `[MATCHER-WORKER] Batch ${String(batchIndex + 1)}/${String(totalBatches)} tamamlandı`,
      );

      return {
        status: 'completed',
        scored: result.scored.length,
        failed: result.failed.length,
        totalJobs: result.totalJobs,
        avgScore,
        batchIndex,
      };
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown error';
      const maxAttempts = job.opts?.attempts ?? 2;
      const isLastAttempt = (job.attemptsMade + 1) >= maxAttempts;

      logger.error(
        {
          jobId: job.id,
          userId: user.id,
          batchIndex,
          error: message,
          attempt: job.attemptsMade + 1,
          isLastAttempt,
        },
        `[MATCHER-WORKER] Batch ${String(batchIndex + 1)}/${String(totalBatches)} başarısız`,
      );

      // ── Safety Net: Don't leave gaps on the last attempt ──────────────
      // "Never Leave Gaps" principle:
      //   If this is the last attempt, throwing makes BullMQ mark the job FAILED.
      //   The listings in that batch would get no MatchResult → frontend hangs.
      //   Instead, save a fallback (score=0) and return completed.
      //   A failing score (0) is better than no score at all.
      if (isLastAttempt) {
        try {
          await this.matcherService.saveFallbackForBatch(user.id, jobs);
          logger.warn(
            { userId: user.id, batchIndex, jobCount: jobs.length },
            '[MATCHER-WORKER] Son deneme — fallback sonuçlar kaydedildi (score=0)',
          );
        } catch (fallbackErr) {
          const fbMsg = fallbackErr instanceof Error ? fallbackErr.message : 'Unknown';
          logger.error(
            { userId: user.id, batchIndex, error: fbMsg },
            '[MATCHER-WORKER] Fallback kaydetme de başarısız — bu ilanlar puanlanmadı kalacak',
          );
        }

        return {
          status: 'completed' as const,
          scored: 0,
          failed: jobs.length,
          totalJobs: jobs.length,
          avgScore: 0,
          batchIndex,
        };
      }

      // First attempt — defer to BullMQ's retry mechanism
      throw err;
    }
  }

  /**
   * Wrapper around job.updateProgress() — type-safe progress reporting.
   */
  private async reportProgress(
    job: Job<MatcherJobData, MatcherJobResult>,
    progress: MatcherJobProgress,
  ): Promise<void> {
    await job.updateProgress(progress);
  }

  /**
   * Compute average score — for logging.
   */
  private calculateAvgScore(scores: number[]): number {
    if (scores.length === 0) return 0;
    const total = scores.reduce((sum, s) => sum + s, 0);
    return Math.round(total / scores.length);
  }
}
