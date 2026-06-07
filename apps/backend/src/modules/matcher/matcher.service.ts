/**
 * MatcherService — Batch Scoring business logic.
 *
 * This service plays the "brain" role:
 *   - Takes the user profile + job listings
 *   - Builds the prompt (buildPrompt)
 *   - Sends it to the LLM via GeminiService
 *   - Writes Zod-validated results to the DB
 *
 * Why separate from GeminiService?
 *   GeminiService = "how to talk to Gemini" (transport)
 *   MatcherService = "what to ask and what to do with the result" (business logic)
 *   If we switch to a different LLM tomorrow, MatcherService stays untouched.
 *
 * Batch logic:
 *   - 8 listings are sent in a single prompt (minimize API calls)
 *   - Gemini scores all 8 listings at once
 *   - Results are Zod-validated and written to the DB
 */

import { Injectable } from '@nestjs/common';
import { PrismaService } from '@/database/prisma.service';
import { GeminiService } from './gemini.service';
import { batchScoringResultSchema } from '@scrape/shared';
import type { BatchScoringResult, SingleScoringResult, MatcherUserProfile, MatcherJobSummary, MatcherScoreInput } from '@scrape/shared';
export type { MatcherScoreInput as MatcherScoreRequest };
import { logger } from '@/utils/helpers';

const MAX_PROMPT_SKILLS = 8;
const MAX_PROMPT_REQUIREMENTS = 4;
const MAX_REQUIREMENT_LENGTH = 120;

// ═══════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════

/**
 * Return type of scoreBatch — score + metadata for each listing.
 */
export interface BatchScoreResult {
  scored: SingleScoringResult[];
  failed: string[];
  totalJobs: number;
}

type MatcherScoreRequest = MatcherScoreInput;

// ═══════════════════════════════════════════
// SERVICE
// ═══════════════════════════════════════════

@Injectable()
export class MatcherService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly gemini: GeminiService,
  ) {}

  /**
   * Score a batch (max 8) of listings against the user profile.
   *
   * Flow:
   *   1. User + Jobs → buildPrompt() → prompt string
   *   2. prompt → GeminiService.generateJSON() → BatchScoringResult
   *   3. Write results to DB (those with score >= minScore)
   *   4. Report successful/failed listings
   */
  async scoreBatch(user: MatcherUserProfile, jobs: MatcherJobSummary[]): Promise<BatchScoreResult> {
    if (jobs.length === 0) {
      return { scored: [], failed: [], totalJobs: 0 };
    }

    const prompt = this.buildPrompt(user, jobs);
    const jobIds = jobs.map((j) => j.id);

    logger.info(
      { userId: user.id, jobCount: jobs.length },
      '[MATCHER] Batch scoring başlatılıyor',
    );

    const result = await this.gemini.generateJSON<BatchScoringResult>(
      prompt,
      batchScoringResultSchema,
    );

    if (result.status === 'error') {
      logger.error(
        { error: result.error.code, jobIds },
        '[MATCHER] Gemini batch scoring başarısız',
      );
      const fallbackResults = this.createFallbackResults(jobs);
      await this.saveResults(user.id, fallbackResults);
      return { scored: fallbackResults, failed: jobIds, totalJobs: jobs.length };
    }

    const validResults = this.validateBatchResults(result.data, jobIds);

    const missingResults = this.createFallbackResults(
      jobs.filter((job) => !validResults.some((resultItem) => resultItem.jobId === job.id)),
    );

    const allResults = [...validResults, ...missingResults];
    await this.saveResults(user.id, allResults);

    const scoredIds = validResults.map((r) => r.jobId);
    const failedIds = jobIds.filter((id) => !scoredIds.includes(id));

    logger.info(
      {
        userId: user.id,
        scored: allResults.length,
        failed: failedIds.length,
        avgScore: this.calculateAvgScore(allResults),
      },
      '[MATCHER] Batch scoring tamamlandı',
    );

    return { scored: allResults, failed: failedIds, totalJobs: jobs.length };
  }

  /**
   * Fetch ALL job listings the user owns.
   *
   * Why not "unscored"?
   * When the user says "Score listings" they may re-score all of their existing listings.
   * This way old records are recomputed against the current profile.
   */
  async getUserJobsForScoring(input: MatcherScoreRequest): Promise<MatcherJobSummary[]> {
    const where = this.buildScoringWhere(input);
    const jobs = await this.prisma.jobListing.findMany({
      where,
      select: {
        id: true,
        title: true,
        company: true,
        location: true,
        skills: true,
        requirements: true,
        seniorityLevel: true,
        employmentType: true,
      },
      orderBy: { scrapedAt: 'desc' },
    });

    return jobs.map((job) => ({
      ...job,
      skills: this.extractSkillNames(job.skills),
    }));
  }

  private buildScoringWhere(input: MatcherScoreRequest) {
    const baseWhere = {
      userJobs: {
        some: { userId: input.userId },
      },
    };

    if (input.scope === 'all') {
      return baseWhere;
    }

    if (input.scope === 'unscored') {
      return {
        ...baseWhere,
        matchResults: {
          none: { userId: input.userId },
        },
      };
    }

    return {
      ...baseWhere,
      id: {
        in: input.jobIds,
      },
    };
  }

  /**
   * Convert the user profile + job listings into an LLM prompt.
   *
   * Why is the prompt design this detailed?
   *   - Give the LLM explicit instructions → consistent output
   *   - Embed the scoring formula in the prompt → same weights every time
   *   - Specify JSON format → improve Zod validation odds
   *   - Request Turkish explanation → user can read it directly
   */
  private buildPrompt(user: MatcherUserProfile, jobs: MatcherJobSummary[]): string {
    const allowedJobIds = jobs.map((job) => job.id).join(', ');

    const jobDescriptions = jobs
      .map(
        (job, i) =>
          `İlan #${String(i + 1)} (ID: ${job.id}):
  Pozisyon: ${job.title}
  Şirket: ${job.company}
  Lokasyon: ${job.location}
  Kıdem: ${job.seniorityLevel ?? 'Belirtilmemiş'}
  Çalışma Tipi: ${job.employmentType ?? 'Belirtilmemiş'}
  İstenen Yetenekler: ${this.compactSkills(job.skills)}
  Gereksinimler: ${this.compactRequirements(job.requirements)}`,
      )
      .join('\n\n');

    return `Sen bir iş eşleştirme uzmanısın. Aşağıdaki kullanıcı profilini analiz et ve her iş ilanı için uygunluk puanı ver.

## Scoring Kuralları
- Puan 0-100 arasında olmalı
- Formül: (Eşleşen Skill Sayısı / İstenen Skill Sayısı) × 60 + (Deneyim Uyumu) × 40
- Deneyim Uyumu: Kullanıcının deneyim yılı ilanın kıdem seviyesine uygunsa 1.0, kısmen uygunsa 0.5, uygun değilse 0.2
- Kıdem eşleştirmesi: Entry (0-2 yıl), Mid (2-5 yıl), Senior (5-8 yıl), Lead/Staff (8+ yıl)
- explanation Türkçe olmalı ve neden bu puanı verdiğini 1-2 cümleyle açıklamalı
- matchedSkills: Kullanıcıda olan VE ilanda istenen skill'ler
- missingSkills: İlanda istenen ama kullanıcıda olmayan skill'ler
- SADECE aşağıdaki jobId listesinden değer kullan: [${allowedJobIds}]
- Listede olmayan bir jobId ASLA üretme
- Yalnızca saf JSON döndür, markdown/code block döndürme

## Kullanıcı Profili
- Yetenekler: ${user.techStack.join(', ')}
- Deneyim: ${String(user.experienceYears)} yıl
- Tercih Edilen Roller: ${user.preferredRoles.join(', ')}
- Tercih Edilen Lokasyonlar: ${user.preferredLocations.join(', ')}

## İş İlanları
${jobDescriptions}

## Yanıt Formatı (JSON)
{
  "results": [
    {
      "jobId": "ilan-id-buraya",
      "score": 0-100 arası sayı,
      "explanation": "Türkçe açıklama",
      "matchedSkills": ["skill1", "skill2"],
      "missingSkills": ["skill3"]
    }
  ]
}

Her ilan için MUTLAKA bir sonuç döndür. results array'inde ${String(jobs.length)} eleman olmalı.`;
  }

  private compactSkills(skills: string[]): string {
    if (skills.length === 0) return 'Belirtilmemiş';
    return skills.slice(0, MAX_PROMPT_SKILLS).join(', ');
  }

  private compactRequirements(requirements: string[]): string {
    if (requirements.length === 0) return 'Belirtilmemiş';

    return requirements
      .slice(0, MAX_PROMPT_REQUIREMENTS)
      .map((item) => item.trim().slice(0, MAX_REQUIREMENT_LENGTH))
      .join('; ');
  }

  /**
   * Validate Gemini results — do the jobIds match the batch?
   *
   * Sometimes Gemini:
   *   - Returns the same jobId twice
   *   - Invents a jobId that isn't in the batch
   *   - Skips some listings
   * This helper filters down to the valid ones.
   */
  private validateBatchResults(
    data: BatchScoringResult,
    expectedJobIds: string[],
  ): SingleScoringResult[] {
    const expectedSet = new Set(expectedJobIds);
    const seenIds = new Set<string>();

    return data.results.filter((r) => {
      if (!expectedSet.has(r.jobId)) {
        logger.warn({ jobId: r.jobId }, '[MATCHER] Beklenmeyen jobId, atlanıyor');
        return false;
      }
      if (seenIds.has(r.jobId)) {
        logger.warn({ jobId: r.jobId }, '[MATCHER] Duplicate jobId, atlanıyor');
        return false;
      }
      seenIds.add(r.jobId);
      return true;
    });
  }

  /**
   * Write scoring results to the MatchResult table.
   *
   * Uses Promise.allSettled — a single upsert error doesn't sink the whole batch.
   * This is the "partial failure tolerance" pattern:
   *   If 7 of 8 listings save successfully and 1 errors → 7 rows land in the DB.
   *   With Promise.all → a single error wipes them all.
   */
  async saveResults(userId: string, results: SingleScoringResult[]): Promise<void> {
    if (results.length === 0) {
      logger.info('[MATCHER] Kaydedilecek sonuç yok');
      return;
    }

    const outcomes = await Promise.allSettled(
      results.map((result) =>
        this.prisma.matchResult.upsert({
          where: {
            userId_jobId: {
              userId,
              jobId: result.jobId,
            },
          },
          create: {
            userId,
            jobId: result.jobId,
            score: result.score,
            explanation: result.explanation,
            matchedSkills: result.matchedSkills,
            missingSkills: result.missingSkills,
          },
          update: {
            score: result.score,
            explanation: result.explanation,
            matchedSkills: result.matchedSkills,
            missingSkills: result.missingSkills,
          },
        }),
      ),
    );

    const failedCount = outcomes.filter((o) => o.status === 'rejected').length;

    if (failedCount > 0) {
      logger.warn(
        { userId, failed: failedCount, total: results.length },
        '[MATCHER] Bazı sonuçlar kaydedilemedi (Promise.allSettled — diğerleri başarılı)',
      );
    }

    logger.info(
      { count: results.length - failedCount, userId },
      '[MATCHER] Sonuçlar DB\'ye yazıldı',
    );
  }

  /**
   * Produce fallback scores for all listings when the LLM result is missing/failed.
   */
  private createFallbackResults(jobs: MatcherJobSummary[]): SingleScoringResult[] {
    return jobs.map((job) => ({
      jobId: job.id,
      score: 0,
      explanation: 'Bu ilan için AI puanlaması tamamlanamadı. Sistem bu kaydı eşleşmedi olarak işaretledi.',
      matchedSkills: [],
      missingSkills: [],
    }));
  }

  /**
   * "Safety net" called on the processor's last attempt.
   *
   * Why is this needed?
   *   In the BullMQ processor both the first and second attempts can fail.
   *   In that case the listings in that batch have NO row in MatchResult.
   *   The frontend checks "scoredCount >= totalJobs" → count never catches up
   *   → polling runs forever → timeout error.
   *
   *   This method guarantees "every listing has a MatchResult under any circumstance".
   *   Saved with score=0 → the frontend at least shows "no match" and doesn't hang.
   */
  async saveFallbackForBatch(userId: string, jobs: MatcherJobSummary[]): Promise<void> {
    const fallback = this.createFallbackResults(jobs);
    await this.saveResults(userId, fallback);
  }

  /**
   * Extract skill names from the JSON skills field.
   *
   * The DB skills field is Json — in ExtractedSkill[] format.
   * We only send skill names in the prompt (category, isMain are unnecessary).
   */
  private extractSkillNames(skills: unknown): string[] {
    if (!Array.isArray(skills)) return [];
    return skills
      .filter((s): s is { name: string } => typeof s === 'object' && s !== null && 'name' in s)
      .map((s) => s.name);
  }

  /**
   * Compute average score — for logging.
   */
  private calculateAvgScore(results: SingleScoringResult[]): number {
    if (results.length === 0) return 0;
    const total = results.reduce((sum, r) => sum + r.score, 0);
    return Math.round(total / results.length);
  }
}
