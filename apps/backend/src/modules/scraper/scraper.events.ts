/**
 * Scraper Event Listener — BullMQ Queue Event Monitoring.
 *
 * Bu dosya Redis kuyruğundaki TÜM event'leri dinler ve loglar.
 * ScraperService'ten farklı olarak, burada iş mantığı YOKTUR — sadece:
 *   1. Structured logging (queue lifecycle observability)
 *   2. Crash recovery (stalled job detection)
 *
 * Neden QueueEventsHost, OnWorkerEvent değil?
 *   - OnWorkerEvent: Worker kendi işlediği job'lar için ateşlenir.
 *     Worker crash ederse event ateşlenmez — çünkü ateşleyecek Worker yok.
 *   - QueueEventsHost: Redis Pub/Sub ile TÜM event'leri dinler.
 *     Worker crash etse bile "stalled" event'i gelir — çünkü dinleme
 *     Worker'dan bağımsız, ayrı bir Redis bağlantısı üzerinden çalışır.
 *
 * QueueEvents event payload'ları:
 *   Event'ler Redis'ten raw string olarak gelir:
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
 * Redis Pub/Sub üzerinden 'scraper' kuyruğundaki event'leri dinler.
 *
 * @QueueEventsListener(QUEUE_NAMES.SCRAPER) ne yapar?
 *   1. NestJS bu class'ı bir QueueEvents listener olarak kaydeder
 *   2. Ayrı bir Redis bağlantısı açar (Worker'dan bağımsız)
 *   3. 'scraper' kuyruğundaki tüm event'leri subscribe eder
 *   4. Event geldiğinde ilgili @OnQueueEvent metodu çağrılır
 */
@QueueEventsListener(QUEUE_NAMES.SCRAPER)
export class ScraperEventListener extends QueueEventsHost {
  /**
   * Job başarıyla tamamlandığında tetiklenir.
   *
   * returnvalue Redis'ten JSON string olarak gelir — parse etmemiz lazım.
   * ScrapeJobCompleted tipine cast ediyoruz (Worker bu tipi döndürüyor).
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
   * Job başarısız olduğunda tetiklenir.
   *
   * failedReason düz string — BullMQ error.message'ı buraya yazar.
   * Audit zaten ScraperService catch bloğunda FAILED olarak işaretleniyor.
   * Burada sadece logluyoruz (observability).
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
   * Worker heartbeat göndermezse tetiklenir — crash recovery.
   *
   * Bu en önemli event: Worker çöktüyse (OOM, segfault, force kill)
   * ScraperService'in catch bloğu çalışamaz. Bu event ile durumu loglarız.
   *
   * Not: BullMQ stalled job'ları otomatik olarak tekrar kuyruğa ekler
   * (stalledInterval ayarına göre). Biz sadece bilgilendiriliyoruz.
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
