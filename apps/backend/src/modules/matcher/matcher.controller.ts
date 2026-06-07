/**
 * Matcher Controller — AI Scoring REST API.
 *
 * Endpoints:
 *   POST /api/matcher/score     — Trigger scoring for a user (enqueue)
 *   GET  /api/matcher/results/:userId — List match results (paginated)
 *
 * This file only handles the HTTP layer:
 *   - Read request body/query (validate with Zod)
 *   - Forward to MatcherService or the queue
 *   - Return the result as JSON
 *
 * Why isn't scoring synchronous?
 *   Even an 8-listing batch takes ~3-5 seconds (LLM call).
 *   Scoring 32 listings sequentially = ~20 second HTTP timeout risk.
 *   Hence fire-and-forget: enqueue, return 202, process in the background.
 *   Same pattern as ScraperController.
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
  NotFoundException,
  ForbiddenException,
  type OnModuleInit,
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
import { CurrentUser } from '@/modules/auth/current-user.decorator';
import type { AuthenticatedUser } from '@/modules/auth/auth.types';
import { logger } from '@/utils/helpers';

// ═══════════════════════════════════════════
// RESPONSE TYPES
// ═══════════════════════════════════════════

/** POST /matcher/score response */
interface ScoreTriggerResponse {
  message: string;
  userId: string;
  scope: MatcherScoreInput['scope'];
  totalJobs: number;
  totalBatches: number;
  batchSize: number;
}

/** GET /matcher/results/:userId response */
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

/** Single match result DTO */
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
export class MatcherController implements OnModuleInit {
  constructor(
    private readonly matcherService: MatcherService,
    private readonly prisma: PrismaService,
    @InjectQueue(QUEUE_NAMES.MATCHER) private readonly matcherQueue: Queue<MatcherJobData>,
  ) {}

  /**
   * Clears stale jobs left over from a previous session on app startup.
   *
   * Why is this needed?
   *   When the backend restarts, old waiting/delayed jobs in Redis start
   *   processing immediately, but they are stale data from the previous session.
   *   The queue should be empty until the user triggers new scoring.
   */
  async onModuleInit(): Promise<void> {
    try {
      // 1) drain waiting + delayed jobs
      await this.matcherQueue.drain();

      // 2) clear completed/failed job history (prevent stale telemetry buildup)
      await this.matcherQueue.clean(0, 10_000, 'completed');
      await this.matcherQueue.clean(0, 10_000, 'failed');

      // 3) any remaining active jobs are stale from the previous session; force clean
      const afterCleanCounts = await this.matcherQueue.getJobCounts();
      if ((afterCleanCounts.active ?? 0) > 0) {
        logger.warn(
          { queue: QUEUE_NAMES.MATCHER, active: afterCleanCounts.active },
          '[MATCHER] Stale active job bulundu — kuyruk force temizleniyor',
        );

        // After a QueueEvents/Worker restart, active jobs with dropped locks
        // can emit stuck/stalled events; that's why we clean on startup.
        await this.matcherQueue.obliterate({ force: true });
      }

      const jobCounts = await this.matcherQueue.getJobCounts();
      logger.info(
        { queue: QUEUE_NAMES.MATCHER, remaining: jobCounts },
        '[MATCHER] Kuyruk temizlendi — eski stale job\'lar silindi',
      );
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Bilinmeyen hata';
      logger.warn(
        { error: msg },
        '[MATCHER] Kuyruk temizleme başarısız — devam ediliyor',
      );
    }
  }

  /**
   * POST /api/matcher/score — Trigger scoring.
   *
   * Flow:
   *   1. Read userId (Zod validate)
   *   2. Find user in DB (404 if missing)
   *   3. Find unscored listings
   *   4. Split into batches of 8
   *   5. Enqueue each batch to BullMQ
   *   6. Return 202 Accepted (will be processed in the background)
   *
   * HTTP 202 = "I received your request, I'm processing it but it isn't done yet."
   */
  @Post('score')
  @HttpCode(HttpStatus.ACCEPTED)
  async triggerScoring(
    // A method-level @UsePipes would also run CurrentUser through zod and strip it;
    // we bind the pipe at the param level on @Body.
    @Body(new ZodValidationPipe(matcherScoreInputSchema)) body: MatcherScoreInput,
    @CurrentUser() authUser: AuthenticatedUser,
  ): Promise<ScoreTriggerResponse> {
    if (body.userId !== authUser.id) {
      throw new ForbiddenException('Sadece kendi ilanlarını puanlayabilirsin');
    }

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

    const jobsToScore = await this.matcherService.getUserJobsForScoring(body);

    if (jobsToScore.length === 0) {
      return {
        message: this.getEmptyScopeMessage(body.scope),
        userId: body.userId,
        scope: body.scope,
        totalJobs: 0,
        totalBatches: 0,
        batchSize: MATCHER_DEFAULTS.BATCH_SIZE,
      };
    }

    // ── Re-scoring: delete old results ──────────────────
    // Frontend polling checks "total result count == total listings".
    // Upsert updates existing rows but the count doesn't grow → count is already 85.
    // The frontend would think "completed" on the first poll. Clean fix: reset first.
    const jobIds = jobsToScore.map((j) => j.id);
    const deleted = await this.prisma.matchResult.deleteMany({
      where: { userId: body.userId, jobId: { in: jobIds } },
    });

    if (deleted.count > 0) {
      logger.info(
        { userId: body.userId, deletedCount: deleted.count },
        '[MATCHER] Eski match sonuçları silindi (re-scoring)',
      );
    }

    const batchSize = Number(
      process.env['MATCHER_BATCH_SIZE'] ?? MATCHER_DEFAULTS.BATCH_SIZE,
    );
    const batches = this.chunkArray(jobsToScore, batchSize);

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
        totalJobs: jobsToScore.length,
        totalBatches: batches.length,
        batchSize,
      },
      '[MATCHER] Scoring job\'ları kuyruğa eklendi',
    );

    return {
      message: this.buildQueuedMessage(body.scope, jobsToScore.length, batches.length),
      userId: body.userId,
      scope: body.scope,
      totalJobs: jobsToScore.length,
      totalBatches: batches.length,
      batchSize,
    };
  }

  private getEmptyScopeMessage(scope: MatcherScoreInput['scope']): string {
    if (scope === 'selected') {
      return 'Seçilen favori ilanlar arasında puanlanacak kayıt yok';
    }

    if (scope === 'unscored') {
      return 'Puanlanmamış ilan yok';
    }

    return 'Puanlanacak ilan yok';
  }

  private buildQueuedMessage(
    scope: MatcherScoreInput['scope'],
    totalJobs: number,
    totalBatches: number,
  ): string {
    const prefix =
      scope === 'selected'
        ? 'Seçilen favori ilanlar'
        : scope === 'unscored'
          ? 'Puanlanmamış ilanlar'
          : 'İlanlar';

    return `${prefix}: ${String(totalJobs)} kayıt ${String(totalBatches)} batch halinde kuyruğa eklendi`;
  }

  /**
   * GET /api/matcher/results/:userId — List match results.
   *
   * Pagination + ordered by score (highest first).
   * Each result is returned with basic listing info joined.
   */
  @Get('results/:userId')
  async getResults(
    @Param('userId') userId: string,
    @Query(new ZodValidationPipe(jobsQuerySchema)) query: JobsQueryInput,
    @CurrentUser() authUser: AuthenticatedUser,
  ): Promise<MatchResultsResponse> {
    if (userId !== authUser.id) {
      throw new ForbiddenException('Sadece kendi sonuçlarını görüntüleyebilirsin');
    }
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
   * Split an array into chunks of the given size.
   *
   * [1,2,3,4,5,6,7,8,9] → chunkArray(_, 3) → [[1,2,3], [4,5,6], [7,8,9]]
   * The last batch may be smaller: 32 listings / 8 = 4 batches (last is full).
   */
  private chunkArray<T>(array: T[], size: number): T[][] {
    const chunks: T[][] = [];
    for (let i = 0; i < array.length; i += size) {
      chunks.push(array.slice(i, i + size));
    }
    return chunks;
  }
}
