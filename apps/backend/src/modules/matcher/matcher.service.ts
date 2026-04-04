/**
 * MatcherService — Batch Scoring iş mantığı.
 *
 * Bu servis "beyin" rolünde:
 *   - Kullanıcı profili + iş ilanlarını alır
 *   - Prompt oluşturur (buildPrompt)
 *   - GeminiService üzerinden LLM'e gönderir
 *   - Zod-validated sonuçları DB'ye yazar
 *
 * Neden GeminiService'den ayrı?
 *   GeminiService = "Gemini ile nasıl konuşulur" (transport)
 *   MatcherService = "Ne sorulur ve sonuçla ne yapılır" (business logic)
 *   Yarın farklı bir LLM kullansak MatcherService'e dokunmayız.
 *
 * Batch mantığı:
 *   - 8 ilan tek prompt'ta gönderilir (API çağrısı minimize)
 *   - Gemini 8 ilanın hepsini aynı anda puanlar
 *   - Sonuçlar Zod ile doğrulanır, DB'ye yazılır
 */

import { Injectable } from '@nestjs/common';
import { PrismaService } from '@/database/prisma.service';
import { GeminiService } from './gemini.service';
import { batchScoringResultSchema } from '@scrape/shared';
import type { BatchScoringResult, SingleScoringResult, MatcherUserProfile, MatcherJobSummary } from '@scrape/shared';
import { logger } from '@/utils/helpers';

// ═══════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════

/**
 * scoreBatch'in dönüş tipi — her ilan için skor + meta bilgi.
 */
export interface BatchScoreResult {
  scored: SingleScoringResult[];
  failed: string[];
  totalJobs: number;
}

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
   * Bir batch (max 8) ilanı kullanıcı profiliyle puanla.
   *
   * Akış:
   *   1. User + Jobs → buildPrompt() → prompt string
   *   2. prompt → GeminiService.generateJSON() → BatchScoringResult
   *   3. Sonuçları DB'ye yaz (score >= minScore olanlar)
   *   4. Başarılı/başarısız ilanları raporla
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
   * Kullanıcının sahip olduğu TÜM iş ilanlarını çeker.
   *
   * Neden "unscored" değil?
   * Kullanıcı "İlanları puanla" dediğinde mevcut tüm ilanlarını tekrar puanlayabilir.
   * Bu sayede eski kayıtlar da güncel profile göre yeniden hesaplanır.
   */
  async getUserJobsForScoring(userId: string): Promise<MatcherJobSummary[]> {
    const jobs = await this.prisma.jobListing.findMany({
      where: {
        userJobs: {
          some: { userId },
        },
      },
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

  /**
   * Kullanıcı profili + iş ilanlarını LLM prompt'una dönüştürür.
   *
   * Prompt tasarımı neden bu kadar detaylı?
   *   - LLM'e açık talimat ver → tutarlı output
   *   - Scoring formülünü prompt'a göm → her seferinde aynı ağırlıkları kullan
   *   - JSON format belirt → Zod validation şansını artır
   *   - Türkçe explanation iste → kullanıcı doğrudan okuyabilsin
   */
  private buildPrompt(user: MatcherUserProfile, jobs: MatcherJobSummary[]): string {
    const jobDescriptions = jobs
      .map(
        (job, i) =>
          `İlan #${String(i + 1)} (ID: ${job.id}):
  Pozisyon: ${job.title}
  Şirket: ${job.company}
  Lokasyon: ${job.location}
  Kıdem: ${job.seniorityLevel ?? 'Belirtilmemiş'}
  Çalışma Tipi: ${job.employmentType ?? 'Belirtilmemiş'}
  İstenen Yetenekler: ${job.skills.length > 0 ? job.skills.join(', ') : 'Belirtilmemiş'}
  Gereksinimler: ${job.requirements.length > 0 ? job.requirements.join('; ') : 'Belirtilmemiş'}`,
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

  /**
   * Gemini sonuçlarını doğrular — batch'teki jobId'ler eşleşiyor mu?
   *
   * Gemini bazen:
   *   - Aynı jobId'yi iki kez döner
   *   - Batch'te olmayan bir jobId uydurur
   *   - Bazı ilanları atlar
   * Bu helper geçerli olanları filtreler.
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
   * Puanlama sonuçlarını MatchResult tablosuna yazar.
   *
   * Promise.allSettled kullanılır — tek bir upsert hatası tüm batch'i çökertmez.
   * Bu "partial failure tolerance" (kısmi hata toleransı) pattern'i:
   *   8 ilandan 7'si başarıyla kaydedilir, 1'i hata verirse → 7 kayıt DB'ye girer.
   *   Promise.all kullansak → 1 hata tümünü sıfırlar.
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
   * LLM sonucu eksik/başarısız döndüğünde tüm ilanlar için fallback skor üretir.
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
   * Processor'ın son denemesinde çağırdığı "güvenlik ağı" (safety net).
   *
   * Neden gerekli?
   *   BullMQ processor'da hem birinci hem ikinci attempt başarısız olabilir.
   *   Bu durumda o batch'teki ilanlar MatchResult tablosunda HİÇ yer almaz.
   *   Frontend "scoredCount >= totalJobs" kontrolünü yapıyor → count hiç yetmez
   *   → polling sonsuza kadar devam eder → timeout hatası.
   *
   *   Bu metod: "her koşulda her ilan bir MatchResult'a sahip olsun" garantisi sağlar.
   *   score=0 ile kaydedilir → frontend en azından "eşleşmedi" gösterir, takılmaz.
   */
  async saveFallbackForBatch(userId: string, jobs: MatcherJobSummary[]): Promise<void> {
    const fallback = this.createFallbackResults(jobs);
    await this.saveResults(userId, fallback);
  }

  /**
   * JSON skills alanından skill isimlerini çıkarır.
   *
   * DB'deki skills alanı Json tipinde — ExtractedSkill[] formatında.
   * Prompt'a sadece skill isimlerini gönderiyoruz (category, isMain gereksiz).
   */
  private extractSkillNames(skills: unknown): string[] {
    if (!Array.isArray(skills)) return [];
    return skills
      .filter((s): s is { name: string } => typeof s === 'object' && s !== null && 'name' in s)
      .map((s) => s.name);
  }

  /**
   * Ortalama skor hesaplar — loglama için.
   */
  private calculateAvgScore(results: SingleScoringResult[]): number {
    if (results.length === 0) return 0;
    const total = results.reduce((sum, r) => sum + r.score, 0);
    return Math.round(total / results.length);
  }
}
