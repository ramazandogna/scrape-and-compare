/**
 * Matcher Event Listener — BullMQ Queue Event Monitoring.
 *
 * This file listens to and logs matcher events on the Redis queue.
 * Unlike MatcherService, there is NO business logic here — only:
 *   1. Structured logging (queue lifecycle observability)
 *   2. Crash recovery (stalled job detection)
 *
 * Why QueueEventsHost?
 *   - OnWorkerEvent: Only fires for jobs this Worker itself processed.
 *     If the Worker crashes, no event is emitted.
 *   - QueueEventsHost: Listens to ALL events via Redis Pub/Sub.
 *     Even if the Worker crashes, a "stalled" event arrives.
 *
 * Same pattern as ScraperEventListener.
 */

import { QueueEventsListener, QueueEventsHost, OnQueueEvent } from '@nestjs/bullmq';
import { QUEUE_NAMES } from '@scrape/shared';
import type { MatcherJobCompleted } from '@scrape/shared';
import { logger } from '@/utils/helpers';

// ═══════════════════════════════════════════
// EVENT LISTENER
// ═══════════════════════════════════════════

/**
 * Listens to events on the 'matcher' queue via Redis Pub/Sub.
 */
@QueueEventsListener(QUEUE_NAMES.MATCHER)
export class MatcherEventListener extends QueueEventsHost {
  /**
   * Fires when batch scoring completes successfully.
   *
   * returnvalue arrives from Redis as a JSON string — we parse and log it.
   */
  @OnQueueEvent('completed')
  onCompleted({
    jobId,
    returnvalue,
  }: {
    jobId: string;
    returnvalue: string;
    prev?: string;
  }): void {
    const result = safeParse<MatcherJobCompleted>(returnvalue);

    logger.info(
      {
        jobId,
        scored: result?.scored,
        failed: result?.failed,
        totalJobs: result?.totalJobs,
        avgScore: result?.avgScore,
        batchIndex: result?.batchIndex,
      },
      `[MATCHER-EVENT] Job tamamlandı: ${jobId}`,
    );
  }

  /**
   * Fires when batch scoring fails.
   *
   * failedReason is a plain string — BullMQ writes error.message here.
   * If retry is configured, BullMQ retries automatically.
   */
  @OnQueueEvent('failed')
  onFailed({
    jobId,
    failedReason,
  }: {
    jobId: string;
    failedReason: string;
    prev?: string;
  }): void {
    logger.error(
      { jobId, failedReason },
      `[MATCHER-EVENT] Job başarısız: ${jobId}`,
    );
  }

  /**
   * Fires when the Worker stops sending heartbeats — crash recovery.
   *
   * If the Worker crashed (OOM, segfault), this event detects it.
   * BullMQ automatically re-enqueues stalled jobs.
   */
  @OnQueueEvent('stalled')
  onStalled({ jobId }: { jobId: string }): void {
    logger.warn(
      { jobId, action: 'BullMQ otomatik retry yapacak' },
      `[MATCHER-EVENT] Job stalled (Worker yanıt vermiyor): ${jobId}`,
    );
  }
}

// ═══════════════════════════════════════════
// HELPER
// ═══════════════════════════════════════════

/**
 * Safely parse a JSON string.
 *
 * QueueEvents returnvalues arrive from Redis as raw strings.
 * Returns null on parse failure (graceful degradation instead of crash).
 */
function safeParse<T>(json: string): T | null {
  try {
    return JSON.parse(json) as T;
  } catch {
    return null;
  }
}
