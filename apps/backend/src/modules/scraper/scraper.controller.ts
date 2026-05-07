/**
 * Scraper Controller — HTTP API endpoint'leri.
 *
 * Bu dosya dış dünyayla (frontend, Postman, curl) iletişim kurar.
 * Kendi iş mantığı YOKTUR — sadece:
 *   1. POST /scrape/trigger → Queue'ya job ekle, jobId dön
 *   2. GET /scrape/status/:jobId → Job durumunu Redis'ten oku, dön
 *
 * Neden Controller ayrı?
 *   - ScraperService → "Nasıl scrape edilir?" (iş mantığı)
 *   - ScraperProcessor → "Kuyruktan nasıl alınır?" (queue transport)
 *   - ScraperController → "HTTP'den nasıl tetiklenir?" (HTTP transport)
 *   Her biri tek bir sorumluluğa sahip (SRP).
 *
 * @InjectQueue(QUEUE_NAMES.SCRAPER) ne yapar?
 *   NestJS DI'dan 'scraper' isimli Queue instance'ını ister.
 *   Bu Queue, BullModule.registerQueue() ile kaydedilmiş olmalı.
 *   Queue.add() ile Redis'e job eklenir — Worker otomatik alır.
 *
 * Fire-and-Forget Pattern:
 *   POST /trigger anında döner (< 1ms). Scraping arka planda çalışır.
 *   Client istediği zaman GET /status/:id ile durumu kontrol eder.
 *   HTTP 202 (Accepted) = "İsteğini aldım, işliyorum ama henüz bitmedi."
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

/** POST /scrape/trigger yanıtı */
interface TriggerResponse {
  jobId: string;
  message: string;
}

/** GET /scrape/status/:jobId yanıtı */
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
 * @Controller('scrape') → Tüm route'lar /scrape prefix'i altında:
 *   POST /scrape/trigger
 *   GET  /scrape/status/:jobId
 */
@Controller('scrape')
export class ScraperController {
  constructor(
    /**
     * @InjectQueue(QUEUE_NAMES.SCRAPER) — DI'dan Queue instance'ını al.
     *
     * Generic tipler: Queue<Data, Result>
     *   - Data = ScrapeJobData → queue.add() ile gönderilen veri tipi
     *   - Result = ScrapeJobResult → job.returnvalue tipi
     *
     * Bu Queue nesnesi sadece job EKLEMEK ve SORGULAMAK için kullanılır.
     * Job İŞLEMEK Processor'ın (Worker) işi — Controller buna karışmaz.
     */
    @InjectQueue(QUEUE_NAMES.SCRAPER)
    private readonly scrapeQueue: Queue<ScrapeJobData, ScrapeJobResult>,
  ) {}

  /**
   * POST /scrape/trigger — Yeni scrape job'ı kuyruğa ekler.
   *
   * @HttpCode(202) neden 200 değil?
   *   HTTP 202 Accepted = "İsteğini aldım, KABUL ETTİM, ama henüz işlemedim."
   *   HTTP 200 OK = "İsteğini işledim, İŞTE SONUÇ."
   *   Biz scrape'i hemen yapmıyoruz — kuyruğa ekliyoruz. Bu yüzden 202.
   *
   * @param body ScrapeJobData — { keywords, location, config? }
   * @returns TriggerResponse — { jobId, message }
   */
  @Post('trigger')
  @HttpCode(HttpStatus.ACCEPTED)
  async trigger(
    // Pipe parametreye bağlanır — method-level @UsePipes CurrentUser'ı bozardı.
    @Body(new ZodValidationPipe(scrapeJobDataSchema)) body: ScrapeJobData,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<TriggerResponse> {
    // userId her zaman auth'tan gelir — body'deki override edilir.
    const payload: ScrapeJobData = { ...body, userId: user.id };
    const job = await this.scrapeQueue.add('scrape', payload, {
      /**
       * removeOnComplete: Tamamlanan job'ları Redis'ten sil (bellek tasarrufu).
       * Son 100 tamamlanan job'ı tut — status sorgusu için lazım.
       * removeOnFail: Başarısız job'ları da benzer şekilde yönet.
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
   * GET /scrape/status/:jobId — Job durumunu sorgular.
   *
   * BullMQ Job State'leri:
   *   - waiting:    Kuyrukta bekliyor (henüz Worker almadı)
   *   - active:     Worker işliyor (scraping devam ediyor)
   *   - completed:  Başarıyla tamamlandı (result mevcut)
   *   - failed:     Hata oluştu (failedReason mevcut)
   *   - delayed:    Zamanlı çalışma bekliyor
   *   - unknown:    Job Redis'te bulunamadı (silinmiş veya geçersiz ID)
   *
   * @param jobId BullMQ job ID'si (POST /trigger'dan dönen)
   * @returns StatusResponse — mevcut durum, ilerleme ve sonuç
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
 * BullMQ progress objesini ScrapeJobProgress'e çevirir.
 *
 * job.progress: number | object | undefined
 * Biz her zaman ScrapeJobProgress nesnesi gönderiyoruz (Processor'da).
 * Ama BullMQ number da kabul eder, bu yüzden güvenli kontrol yapıyoruz.
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
