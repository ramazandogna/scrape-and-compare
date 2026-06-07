/**
 * Scraper Event Listener — BullMQ Queue Event Monitoring.
 *
 * This file listens to ALL events on the Redis queue and logs them.
 * Unlike ScraperService, it contains NO business logic — only:
 *   1. Structured logging (queue lifecycle observability)
 *   2. Crash recovery (stalled job detection)
 *
 * Why QueueEventsHost instead of OnWorkerEvent?
 *   - OnWorkerEvent: fires for jobs the Worker itself processes.
 *     If the Worker crashes, no event fires — there is no Worker to fire it.
 *   - QueueEventsHost: listens to ALL events via Redis Pub/Sub.
 *     Even if the Worker crashes, the "stalled" event still arrives — because
 *     the listener is independent of the Worker and runs on a separate Redis connection.
 *
 * QueueEvents event payloads:
 *   Events arrive from Redis as raw strings:
 *   - completed: { jobId, returnvalue (JSON string), prev }
 *   - failed:    { jobId, failedReason (string), prev }
 *   - stalled:   { jobId }
 *   - progress:  { jobId, data (JSON string) }
 */

import { QueueEventsListener, QueueEventsHost, OnQueueEvent } from '@nestjs/bullmq';
import { QUEUE_NAMES } from '@scrape/shared';
import type { ScrapeJobCompleted } from '@scrape/shared';
import { logger } from '@/utils/helpers';

// ═══════════════════════════════════════════
// EVENT LISTENER
// ═══════════════════════════════════════════

/**
 * Listens for events on the 'scraper' queue via Redis Pub/Sub.
 *
 * What does @QueueEventsListener(QUEUE_NAMES.SCRAPER) do?
 *   1. NestJS registers this class as a QueueEvents listener
 *   2. Opens a separate Redis connection (independent of the Worker)
 *   3. Subscribes to all events on the 'scraper' queue
 *   4. Invokes the matching @OnQueueEvent method when an event arrives
 */
@QueueEventsListener(QUEUE_NAMES.SCRAPER)
export class ScraperEventListener extends QueueEventsHost {
  /**
   * Fires when a job completes successfully.
   *
   * returnvalue arrives from Redis as a JSON string — we must parse it.
   * Cast to ScrapeJobCompleted (the Worker returns this type).
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
    const result = safeParse<ScrapeJobCompleted>(returnvalue);

    logger.info(`[QueueEvent] Job tamamlandı: ${jobId}`, {
      jobId,
      targetNewJobs: result?.targetNewJobs,
      targetReached: result?.targetReached,
      totalJobs: result?.totalJobs,
      created: result?.created,
      updated: result?.updated,
      durationMs: result?.durationMs,
      auditId: result?.auditId,
    });
  }

  /**
   * Fires when a job fails.
   *
   * failedReason is a plain string — BullMQ writes error.message here.
   * The audit is already marked FAILED in the ScraperService catch block.
   * Here we only log (observability).
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
    logger.error(`[QueueEvent] Job başarısız: ${jobId}`, {
      jobId,
      failedReason,
    });
  }

  /**
   * Fires when the Worker stops sending heartbeats — crash recovery.
   *
   * This is the most important event: if the Worker crashed (OOM, segfault, force kill)
   * the ScraperService catch block cannot run. We log the situation via this event.
   *
   * Note: BullMQ re-enqueues stalled jobs automatically (per stalledInterval).
   * We are only being notified.
   */
  @OnQueueEvent('stalled')
  onStalled({ jobId }: { jobId: string }): void {
    logger.warn(`[QueueEvent] Job stalled (Worker yanıt vermiyor): ${jobId}`, {
      jobId,
      action: 'BullMQ otomatik retry yapacak',
    });
  }
}

// ═══════════════════════════════════════════
// HELPER
// ═══════════════════════════════════════════

/**
 * Safely parses a JSON string.
 *
 * QueueEvents returnvalues arrive from Redis as raw strings.
 * Returns null on parse failure (graceful degradation instead of crashing).
 */
function safeParse<T>(json: string): T | null {
  try {
    return JSON.parse(json) as T;
  } catch {
    return null;
  }
}
