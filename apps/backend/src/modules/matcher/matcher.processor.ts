/**
 * Matcher Processor — BullMQ Worker (Rate-Limited).
 *
 * Bu dosya Redis kuyruğu ile MatcherService arasındaki köprüdür.
 * Kendi iş mantığı YOKTUR — sadece:
 *   1. Kuyruktan batch job al (BullMQ otomatik yapar)
 *   2. MatcherService.scoreBatch(user, jobs) çağır
 *   3. Sonucu Redis'e dön (BullMQ otomatik yapar)
 *
 * Rate Limiting:
 *   Gemini free tier = 15 RPM. Biz 10 RPM'de kalıyoruz (5 RPM headroom).
 *   BullMQ Worker'ın `limiter` ayarı bunu otomatik yapar:
 *   { max: 10, duration: 60000 } → "dakikada max 10 job işle"
 *   Kalan job'lar Redis'te bekler, sırası gelince işlenir.
 *
 * ScraperProcessor'dan farkı:
 *   - Scraper: browser açar, sayfa tarar, DB'ye yazar (ağır I/O)
 *   - Matcher: prompt gönderir, JSON alır, DB'ye yazar (hafif ama rate-limited)
 *   Her ikisi de aynı pattern: WorkerHost extend et, process() implement et.
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
 * BullMQ Worker — Redis kuyruğundan matcher job'larını işler.
 *
 * Generic tipler: Job<MatcherJobData, MatcherJobResult>
 *   - MatcherJobData = { user, jobs[], batchIndex, totalBatches }
 *   - MatcherJobResult = { status: 'completed', scored, failed, ... } | { status: 'failed', ... }
 *
 * Rate Limiting:
 *   Worker constructor'da limiter ayarı yapılır.
 *   BullMQ her job'dan sonra "dakikada kaç job işledim?" kontrol eder.
 *   Limit aşılırsa sonraki job'ı bekletir.
 */
@Injectable()
@Processor(QUEUE_NAMES.MATCHER, {
  limiter: {
    max: Number(process.env['MATCHER_RATE_LIMIT'] ?? MATCHER_DEFAULTS.RATE_LIMIT_RPM),
    duration: 60_000,
  },
})
export class MatcherProcessor extends WorkerHost {
  constructor(
    private readonly matcherService: MatcherService,
  ) {
    super();
  }

  /**
   * Her batch job geldiğinde BullMQ tarafından çağrılır.
   *
   * Bu metod:
   *   - Return ederse → job COMPLETED olarak işaretlenir
   *   - Throw ederse → job FAILED olarak işaretlenir (retry varsa tekrar dener)
   *
   * @param job BullMQ Job nesnesi — job.data ile MatcherJobData'ya erişilir
   * @returns MatcherJobResult — başarılı/başarısız sonuç
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

    // İlerleme: SCORING fazına geçiyoruz
    await this.reportProgress(job, {
      phase: 'SCORING',
      message: `Batch ${String(batchIndex + 1)}/${String(totalBatches)}: ${String(jobs.length)} ilan puanlanıyor`,
      batchIndex,
      totalBatches,
      percentage: Math.round(((batchIndex) / totalBatches) * 100),
    });

    try {
      const result = await this.matcherService.scoreBatch(user, jobs);

      // İlerleme: SAVING fazına geçiyoruz
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

      // ── Safety Net: Son denemede boşluk bırakma ──────────────
      // "Never Leave Gaps" prensibi:
      //   Eğer bu son attempt'se, throw edersek BullMQ job'ı FAILED yapar.
      //   O batch'teki ilanlar hiç MatchResult almaz → frontend takılır.
      //   Bunun yerine fallback (score=0) kaydet ve completed dön.
      //   Başarısız bir skor (0), hiç skor olmamasından iyidir.
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

      // İlk deneme — BullMQ retry mekanizmasına bırak
      throw err;
    }
  }

  /**
   * job.updateProgress() wrapper'ı — type-safe progress bildirimi.
   */
  private async reportProgress(
    job: Job<MatcherJobData, MatcherJobResult>,
    progress: MatcherJobProgress,
  ): Promise<void> {
    await job.updateProgress(progress);
  }

  /**
   * Ortalama skor hesaplar — loglama için.
   */
  private calculateAvgScore(scores: number[]): number {
    if (scores.length === 0) return 0;
    const total = scores.reduce((sum, s) => sum + s, 0);
    return Math.round(total / scores.length);
  }
}
