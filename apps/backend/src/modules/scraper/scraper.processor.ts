/**
 * Scraper Processor — BullMQ Worker.
 *
 * Bu dosya Redis kuyruğu ile ScraperService arasındaki köprüdür.
 * Kendi iş mantığı YOKTUR — sadece:
 *   1. Kuyruktan job al (BullMQ otomatik yapar)
 *   2. ScraperService.runFastScrape(job.data) çağır
 *   3. Sonucu Redis'e dön (BullMQ otomatik yapar)
 *
 * Neden ayrı dosya? Single Responsibility Principle:
 *   - ScraperService → "Nasıl scrape edilir?" (iş mantığı)
 *   - ScraperProcessor → "Kuyruktan nasıl alınır?" (transport katmanı)
 *
 * @Processor decorator'ı ne yapar?
 *   1. NestJS bu class'ı bir BullMQ Worker olarak kaydeder
 *   2. Redis'e bağlanır ve QUEUE_NAMES.SCRAPER kuyruğunu dinler
 *   3. Job geldiğinde process() metodunu çağırır
 *   4. process() return ederse → job COMPLETED olarak işaretlenir
 *   5. process() throw ederse → job FAILED olarak işaretlenir
 *
 * WorkerHost nedir?
 *   @nestjs/bullmq'nun abstract class'ı. Worker lifecycle'ını yönetir:
 *   - Redis bağlantısı kurma/kapama
 *   - Job alma döngüsü (polling)
 *   - Hata yakalama ve retry mekanizması
 *   Sen sadece process() metodunu implement edersin.
 */

import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Inject, Injectable } from '@nestjs/common';
import type { Job } from 'bullmq';
import type { ScrapeJobData, ScrapeJobResult, ScrapeJobProgress } from '@scrape/shared';
import { QUEUE_NAMES } from '@scrape/shared';
import { ScraperService } from './scraper.service';
import { logger } from '@/utils/helpers';

// ═══════════════════════════════════════════
// PROCESSOR (WORKER)
// ═══════════════════════════════════════════

/**
 * BullMQ Worker — Redis kuyruğundan scrape job'larını işler.
 *
 * Generic tipler: Job<Data, Result>
 *   - Data = ScrapeJobData → job.data'nın tipi (keywords, location, config?)
 *   - Result = ScrapeJobResult → process() return değerinin tipi
 *
 * @Processor(QUEUE_NAMES.SCRAPER) ne demek?
 *   "Bu class 'scraper' isimli kuyruğu dinle" demek.
 *   QUEUE_NAMES.SCRAPER = 'scraper' — magic string yerine sabit kullanıyoruz.
 */
@Injectable()
@Processor(QUEUE_NAMES.SCRAPER)
export class ScraperProcessor extends WorkerHost {
  constructor(
    @Inject(ScraperService)
    private readonly scraperService: ScraperService,
  ) {
    super();
  }

  /**
   * Her job geldiğinde BullMQ tarafından çağrılır.
   *
   * Bu metod:
   *   - Return ederse → job.returnvalue = dönüş değeri, state = COMPLETED
   *   - Throw ederse → job.failedReason = error.message, state = FAILED
   *
   * @param job BullMQ Job nesnesi — job.data ile payload'a, job.id ile unique ID'ye erişilir
   * @returns ScrapeJobResult — başarılıysa ScrapeJobCompleted, hatalıysa throw eder (BullMQ yakalar)
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

    // İlerleme bildirimi: SCANNING fazına geçiyoruz
    await this.reportProgress(job, {
      phase: 'SCANNING',
      message: `${keywords.length} keyword taranacak: ${keywords.join(', ')}`,
      percentage: 0,
    });

    try {
      // Asıl iş burada — ScraperService tüm scraping mantığını çalıştırır
      const result = await this.scraperService.runFastScrape(job.data);

      // Son ilerleme bildirimi: tamamlandı
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

      // throw edersek BullMQ job'ı FAILED olarak işaretler
      // retry ayarı varsa otomatik tekrar dener
      throw err;
    }
  }

  /**
   * job.updateProgress() wrapper'ı — type-safe progress bildirimi.
   *
   * BullMQ'nun updateProgress() metodu `number | object` kabul eder.
   * Biz her zaman ScrapeJobProgress tipinde nesne gönderiyoruz.
   */
  private async reportProgress(
    job: Job<ScrapeJobData, ScrapeJobResult>,
    progress: ScrapeJobProgress,
  ): Promise<void> {
    await job.updateProgress(progress);
  }
}
