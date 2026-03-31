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
import { batchScoringResultSchema, MATCHER_DEFAULTS } from '@scrape/shared';
import type { BatchScoringResult, SingleScoringResult } from '@scrape/shared';
import { logger } from '@/utils/helpers';

// ═══════════════════════════════════════════
// TYPES — Prompt'a gönderilecek hafif veri yapıları
// ═══════════════════════════════════════════

/**
 * Prompt'a gönderilecek kullanıcı profili.
 *
 * DB'deki User modelinin tamamını değil, sadece scoring için
 * gereken alanları gönderiyoruz. Token tasarrufu + privacy.
 */
interface UserProfile {
  id: string;
  techStack: string[];
  experienceYears: number;
  preferredRoles: string[];
  preferredLocations: string[];
}

/**
 * Prompt'a gönderilecek iş ilanı özeti.
 *
 * description tam metni çok uzun olabilir (2000+ token).
 * Sadece scoring için gerekli alanları gönderiyoruz.
 * skills zaten description'dan extract edilmiş hali.
 */
interface JobSummary {
  id: string;
  title: string;
  company: string;
  location: string;
  skills: string[];
  requirements: string[];
  seniorityLevel: string | null;
  employmentType: string | null;
}

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
  private readonly minScore: number;

  constructor(
    private readonly prisma: PrismaService,
    private readonly gemini: GeminiService,
  ) {
    this.minScore = Number(process.env['MATCHER_MIN_SCORE'] ?? MATCHER_DEFAULTS.MIN_SCORE);
  }

  /**
   * Bir batch (max 8) ilanı kullanıcı profiliyle puanla.
   *
   * Akış:
   *   1. User + Jobs → buildPrompt() → prompt string
   *   2. prompt → GeminiService.generateJSON() → BatchScoringResult
   *   3. Sonuçları DB'ye yaz (score >= minScore olanlar)
   *   4. Başarılı/başarısız ilanları raporla
   */
  async scoreBatch(user: UserProfile, jobs: JobSummary[]): Promise<BatchScoreResult> {
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
      return { scored: [], failed: jobIds, totalJobs: jobs.length };
    }

    const validResults = this.validateBatchResults(result.data, jobIds);
    await this.saveResults(user.id, validResults);

    const scoredIds = validResults.map((r) => r.jobId);
    const failedIds = jobIds.filter((id) => !scoredIds.includes(id));

    logger.info(
      {
        userId: user.id,
        scored: validResults.length,
        failed: failedIds.length,
        avgScore: this.calculateAvgScore(validResults),
      },
      '[MATCHER] Batch scoring tamamlandı',
    );

    return { scored: validResults, failed: failedIds, totalJobs: jobs.length };
  }

  /**
   * DB'den henüz puanlanmamış iş ilanlarını çeker.
   *
   * SQL mantığı:
   *   SELECT * FROM job_listings
   *   WHERE id NOT IN (SELECT jobId FROM match_results WHERE userId = ?)
   *
   * Prisma bunu `none` filtresi ile yapar — raw SQL'e gerek yok.
   */
  async getUnscoredJobs(userId: string): Promise<JobSummary[]> {
    const jobs = await this.prisma.jobListing.findMany({
      where: {
        matchResults: {
          none: { userId },
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
  private buildPrompt(user: UserProfile, jobs: JobSummary[]): string {
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
   * Prisma createMany ile toplu insert — 8 ayrı INSERT yerine tek sorgu.
   * skipDuplicates: Aynı user-job çifti zaten varsa sessizce atla.
   * minScore altı sonuçlar kaydedilmez (gereksiz veri önleme).
   */
  private async saveResults(userId: string, results: SingleScoringResult[]): Promise<void> {
    const qualifiedResults = results.filter((r) => r.score >= this.minScore);

    if (qualifiedResults.length === 0) {
      logger.info('[MATCHER] Minimum skoru geçen sonuç yok, DB\'ye yazılmadı');
      return;
    }

    await this.prisma.matchResult.createMany({
      data: qualifiedResults.map((r) => ({
        userId,
        jobId: r.jobId,
        score: r.score,
        explanation: r.explanation,
        matchedSkills: r.matchedSkills,
        missingSkills: r.missingSkills,
      })),
      skipDuplicates: true,
    });

    logger.info(
      { count: qualifiedResults.length, userId },
      '[MATCHER] Sonuçlar DB\'ye yazıldı',
    );
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
