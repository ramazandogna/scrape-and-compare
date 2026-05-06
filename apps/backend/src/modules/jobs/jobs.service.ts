/**
 * Jobs Service — İş ilanlarını veritabanından sorgulama.
 *
 * Bu servis Prisma ORM üzerinden JobListing tablosunu okur.
 * İş mantığı (filtreleme, pagination, sıralama) burada yaşar.
 * Controller sadece HTTP request/response ile ilgilenir, sorgulama burada.
 *
 * Neden ayrı modül (scraper'dan bağımsız)?
 *   - Scraper: "veri toplar" (yazma — Create/Update)
 *   - Jobs: "veri sunar" (okuma — Read)
 *   - İki farklı sorumluluk → iki farklı modül (SRP)
 */

import { Injectable } from '@nestjs/common';
import { PrismaService } from '@/database/prisma.service';
import type { JobsQueryInput } from '@scrape/shared';
import { logger } from '@/utils/helpers';

// ═══════════════════════════════════════════
// RESPONSE TYPE
// ═══════════════════════════════════════════

/**
 * Paginated response — frontend pagination UI'ı için gereken tüm bilgiler.
 *
 * totalPages ve hasNext/hasPrev ile frontend "Sonraki sayfa" butonunu
 * gösterip göstermemeye karar verir.
 */
export interface PaginatedJobs {
  data: JobListingDto[];
  meta: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
    hasNext: boolean;
    hasPrev: boolean;
  };
}

/**
 * JobListing DTO — frontend'e dönen iş ilanı verisi.
 *
 * DB'deki tüm alanları değil, sadece frontend'in ihtiyaç duyduklarını dönüyoruz.
 * description gibi büyük alanlar listede gereksiz, detay sayfasında döner (gelecek).
 */
export interface JobListingDto {
  id: string;
  externalId: string;
  url: string;
  title: string;
  company: string;
  logoUrl: string | null;
  location: string;
  salary: string | null;
  salaryMin: number | null;
  salaryMax: number | null;
  salaryCurrency: string | null;
  seniorityLevel: string | null;
  employmentType: string | null;
  workType: string | null;
  skills: unknown;
  postedDate: string | null;
  source: string;
  scrapedAt: Date;
}

// ═══════════════════════════════════════════
// SERVICE
// ═══════════════════════════════════════════

@Injectable()
export class JobsService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * İş ilanlarını paginated, filtrelenmiş ve sıralanmış şekilde döner.
   *
   * Prisma query yapısı:
   *   - where: filtreleme koşulları (search + location)
   *   - orderBy: sıralama
   *   - skip/take: pagination (offset-based)
   *   - select: sadece gereken alanlar (description hariç — büyük alan)
   *
   * @param query Zod ile validate edilmiş query parametreleri
   */
  async findAll(query: JobsQueryInput): Promise<PaginatedJobs> {
    const { page, limit, userId, search, location, sort } = query;

    const where = this.buildWhereClause(userId, search, location);

    const [data, total] = await Promise.all([
      this.prisma.jobListing.findMany({
        where,
        orderBy: { scrapedAt: sort === 'newest' ? 'desc' : 'asc' },
        skip: (page - 1) * limit,
        take: limit,
        select: {
          id: true,
          externalId: true,
          url: true,
          title: true,
          company: true,
          logoUrl: true,
          location: true,
          salary: true,
          salaryMin: true,
          salaryMax: true,
          salaryCurrency: true,
          seniorityLevel: true,
          employmentType: true,
          workType: true,
          skills: true,
          postedDate: true,
          source: true,
          scrapedAt: true,
          // description ve requirements hariç — liste görünümünde gereksiz
        },
      }),
      this.prisma.jobListing.count({ where }),
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
   * Prisma WHERE koşullarını oluşturur.
   *
   * search parametresi varsa title, company ve location'da arar (case-insensitive).
   * Prisma'nın `contains` + `mode: 'insensitive'` → SQL ILIKE'a dönüşür.
   *
   * OR mantığı: "React" araması → title'da VEYA company'de VEYA location'da geçen
   * AND mantığı: search + location filtresi birlikte uygulanır
   */
  private buildWhereClause(
    userId?: string,
    search?: string,
    location?: string,
  ): Record<string, unknown> {
    const conditions: Record<string, unknown>[] = [];

    if (userId) {
      conditions.push({
        userJobs: {
          some: { userId },
        },
      });
    }

    if (search) {
      conditions.push({
        OR: [
          { title: { contains: search, mode: 'insensitive' } },
          { company: { contains: search, mode: 'insensitive' } },
        ],
      });
    }

    if (location) {
      conditions.push({
        location: { contains: location, mode: 'insensitive' },
      });
    }

    return conditions.length > 0 ? { AND: conditions } : {};
  }

  // ═══════════════════════════════════════════
  // DELETE OPERATIONS
  // ═══════════════════════════════════════════

  /**
   * Kullanıcının tüm ilan bağlantılarını ve match sonuçlarını siler.
   *
   * Prisma $transaction: Atomik garanti — ya ikisi de silinir ya da hiçbiri.
   * JobListing kayıtları silinmez — başka kullanıcılar aynı ilanları görebilir.
   */
  async removeAllUserJobs(userId: string): Promise<{ removedJobs: number; removedMatches: number }> {
    const [matchResult, jobResult] = await this.prisma.$transaction([
      this.prisma.matchResult.deleteMany({ where: { userId } }),
      this.prisma.userJobListing.deleteMany({ where: { userId } }),
    ]);

    logger.info(
      { userId, removedJobs: jobResult.count, removedMatches: matchResult.count },
      '[JOBS] Kullanıcının tüm ilanları temizlendi',
    );

    return {
      removedJobs: jobResult.count,
      removedMatches: matchResult.count,
    };
  }

  /**
   * Tekil ilan-kullanıcı bağlantısını ve ilgili match sonucunu siler.
   */
  async removeUserJob(userId: string, jobId: string): Promise<{ removed: boolean }> {
    const [matchResult, jobResult] = await this.prisma.$transaction([
      this.prisma.matchResult.deleteMany({ where: { userId, jobId } }),
      this.prisma.userJobListing.deleteMany({ where: { userId, jobId } }),
    ]);

    const removed = jobResult.count > 0;

    if (removed) {
      logger.info({ userId, jobId, matchRemoved: matchResult.count }, '[JOBS] İlan kullanıcıdan kaldırıldı');
    }

    return { removed };
  }
}
