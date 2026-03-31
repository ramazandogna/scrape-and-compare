/**
 * Matcher Controller — AI Scoring REST API.
 *
 * Endpoint'ler:
 *   POST /api/matcher/score     — Bir kullanıcı için puanlama başlat (kuyruğa ekle)
 *   GET  /api/matcher/results/:userId — Eşleşme sonuçlarını listele (paginated)
 *
 * Bu dosya sadece HTTP katmanıyla ilgilenir:
 *   - Request body/query'yi al (Zod ile validate et)
 *   - MatcherService'e veya Queue'ya ilet
 *   - Sonucu JSON olarak dön
 *
 * Scoring neden synchronous değil?
 *   8 ilanlık batch bile ~3-5 saniye sürer (LLM çağrısı).
 *   32 ilanı sırayla puanlamak = ~20 saniye HTTP timeout riski.
 *   Bu yüzden Fire-and-Forget: queue'ya ekle, 202 dön, arka planda işle.
 *   Tıpkı ScraperController'daki pattern gibi.
 */

import {
  Controller,
  Post,
  Get,
  Body,
  Param,
  Query,
  HttpCode,
  HttpStatus,
  UsePipes,
  NotFoundException,
} from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import type { Queue } from 'bullmq';
import {
  QUEUE_NAMES,
  MATCHER_DEFAULTS,
  matcherScoreInputSchema,
  jobsQuerySchema,
} from '@scrape/shared';
import type { MatcherScoreInput, JobsQueryInput, MatcherJobData } from '@scrape/shared';
import { ZodValidationPipe } from '@/pipes/zod-validation.pipe';
import { MatcherService } from './matcher.service';
import { PrismaService } from '@/database/prisma.service';
import { logger } from '@/utils/helpers';

// ═══════════════════════════════════════════
// RESPONSE TYPES
// ═══════════════════════════════════════════

/** POST /matcher/score yanıtı */
interface ScoreTriggerResponse {
  message: string;
  userId: string;
  totalJobs: number;
  totalBatches: number;
  batchSize: number;
}

/** GET /matcher/results/:userId yanıtı */
interface MatchResultsResponse {
  data: MatchResultDto[];
  meta: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
    hasNext: boolean;
    hasPrev: boolean;
  };
}

/** Tek bir eşleşme sonucu DTO */
interface MatchResultDto {
  id: string;
  score: number;
  explanation: string;
  matchedSkills: string[];
  missingSkills: string[];
  createdAt: Date;
  job: {
    id: string;
    title: string;
    company: string;
    location: string;
    url: string;
    seniorityLevel: string | null;
    employmentType: string | null;
  };
}

// ═══════════════════════════════════════════
// CONTROLLER
// ═══════════════════════════════════════════

@Controller('matcher')
export class MatcherController {
  constructor(
    private readonly matcherService: MatcherService,
    private readonly prisma: PrismaService,
    @InjectQueue(QUEUE_NAMES.MATCHER) private readonly matcherQueue: Queue<MatcherJobData>,
  ) {}

  /**
   * POST /api/matcher/score — Puanlama başlat.
   *
   * Akış:
   *   1. userId al (Zod validate)
   *   2. User'ı DB'den bul (yoksa 404)
   *   3. Puanlanmamış ilanları bul
   *   4. 8'erli batch'lere böl
   *   5. Her batch'i BullMQ queue'ya ekle
   *   6. 202 Accepted dön (arka planda işlenecek)
   *
   * HTTP 202 = "İsteğini aldım, işliyorum ama henüz bitmedi."
   */
  @Post('score')
  @HttpCode(HttpStatus.ACCEPTED)
  @UsePipes(new ZodValidationPipe(matcherScoreInputSchema))
  async triggerScoring(@Body() body: MatcherScoreInput): Promise<ScoreTriggerResponse> {
    const user = await this.prisma.user.findUnique({
      where: { id: body.userId },
      select: {
        id: true,
        techStack: true,
        experienceYears: true,
        preferredRoles: true,
        preferredLocations: true,
      },
    });

    if (!user) {
      throw new NotFoundException(`User bulunamadı: ${body.userId}`);
    }

    const unscoredJobs = await this.matcherService.getUnscoredJobs(body.userId);

    if (unscoredJobs.length === 0) {
      return {
        message: 'Puanlanacak yeni ilan yok',
        userId: body.userId,
        totalJobs: 0,
        totalBatches: 0,
        batchSize: MATCHER_DEFAULTS.BATCH_SIZE,
      };
    }

    const batchSize = Number(
      process.env['MATCHER_BATCH_SIZE'] ?? MATCHER_DEFAULTS.BATCH_SIZE,
    );
    const batches = this.chunkArray(unscoredJobs, batchSize);

    for (const [index, batch] of batches.entries()) {
      await this.matcherQueue.add(
        'score-batch',
        {
          user,
          jobs: batch,
          batchIndex: index,
          totalBatches: batches.length,
        },
        {
          attempts: 2,
          backoff: { type: 'exponential', delay: 5000 },
        },
      );
    }

    logger.info(
      {
        userId: body.userId,
        totalJobs: unscoredJobs.length,
        totalBatches: batches.length,
        batchSize,
      },
      '[MATCHER] Scoring job\'ları kuyruğa eklendi',
    );

    return {
      message: `${String(unscoredJobs.length)} ilan ${String(batches.length)} batch halinde kuyruğa eklendi`,
      userId: body.userId,
      totalJobs: unscoredJobs.length,
      totalBatches: batches.length,
      batchSize,
    };
  }

  /**
   * GET /api/matcher/results/:userId — Eşleşme sonuçlarını listele.
   *
   * Pagination + score'a göre sıralama (en yüksek puan önce).
   * Her sonuçla birlikte ilanın temel bilgilerini de döner (join).
   */
  @Get('results/:userId')
  @UsePipes(new ZodValidationPipe(jobsQuerySchema))
  async getResults(
    @Param('userId') userId: string,
    @Query() query: JobsQueryInput,
  ): Promise<MatchResultsResponse> {
    const { page, limit } = query;

    const userExists = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { id: true },
    });

    if (!userExists) {
      throw new NotFoundException(`User bulunamadı: ${userId}`);
    }

    const where = { userId };

    const [data, total] = await Promise.all([
      this.prisma.matchResult.findMany({
        where,
        orderBy: { score: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
        select: {
          id: true,
          score: true,
          explanation: true,
          matchedSkills: true,
          missingSkills: true,
          createdAt: true,
          job: {
            select: {
              id: true,
              title: true,
              company: true,
              location: true,
              url: true,
              seniorityLevel: true,
              employmentType: true,
            },
          },
        },
      }),
      this.prisma.matchResult.count({ where }),
    ]);

    const totalPages = Math.ceil(total / limit);

    return {
      data,
      meta: {
        page,
        limit,
        total,
        totalPages,
        hasNext: page < totalPages,
        hasPrev: page > 1,
      },
    };
  }

  /**
   * Array'i belirtilen boyutta parçalara böler.
   *
   * [1,2,3,4,5,6,7,8,9] → chunkArray(_, 3) → [[1,2,3], [4,5,6], [7,8,9]]
   * Son batch boyuttan küçük olabilir: 32 ilan / 8 = 4 batch (son batch tam)
   */
  private chunkArray<T>(array: T[], size: number): T[][] {
    const chunks: T[][] = [];
    for (let i = 0; i < array.length; i += size) {
      chunks.push(array.slice(i, i + size));
    }
    return chunks;
  }
}
