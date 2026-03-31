/**
 * Matcher Event Listener — BullMQ Queue Event Monitoring.
 *
 * Bu dosya Redis kuyruğundaki matcher event'lerini dinler ve loglar.
 * MatcherService'ten farklı olarak, burada iş mantığı YOKTUR — sadece:
 *   1. Structured logging (queue lifecycle observability)
 *   2. Crash recovery (stalled job detection)
 *
 * Neden QueueEventsHost?
 *   - OnWorkerEvent: Sadece Worker kendi işlediği job'lar için çalışır.
 *     Worker crash ederse event ateşlenmez.
 *   - QueueEventsHost: Redis Pub/Sub ile TÜM event'leri dinler.
 *     Worker crash etse bile "stalled" event'i gelir.
 *
 * ScraperEventListener ile birebir aynı pattern.
 */

import { QueueEventsListener, QueueEventsHost, OnQueueEvent } from '@nestjs/bullmq';
import { QUEUE_NAMES } from '@scrape/shared';
import type { MatcherJobCompleted } from '@scrape/shared';
import { logger } from '@/utils/helpers';

// ═══════════════════════════════════════════
// EVENT LISTENER
// ═══════════════════════════════════════════

/**
 * Redis Pub/Sub üzerinden 'matcher' kuyruğundaki event'leri dinler.
 */
@QueueEventsListener(QUEUE_NAMES.MATCHER)
export class MatcherEventListener extends QueueEventsHost {
  /**
   * Batch scoring başarıyla tamamlandığında tetiklenir.
   *
   * returnvalue Redis'ten JSON string olarak gelir — parse edip logluyoruz.
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
   * Batch scoring başarısız olduğunda tetiklenir.
   *
   * failedReason düz string — BullMQ error.message'ı buraya yazar.
   * Retry ayarı varsa BullMQ otomatik tekrar dener.
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
   * Worker heartbeat göndermezse tetiklenir — crash recovery.
   *
   * Worker çöktüyse (OOM, segfault) bu event ile tespit edilir.
   * BullMQ stalled job'ları otomatik olarak tekrar kuyruğa ekler.
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
 * JSON string'i güvenli parse eder.
 *
 * QueueEvents returnvalue'lar Redis'ten raw string gelir.
 * Parse başarısız olursa null döner (crash yerine graceful degradation).
 */
function safeParse<T>(json: string): T | null {
  try {
    return JSON.parse(json) as T;
  } catch {
    return null;
  }
}
