/**
 * Jobs Service — query job listings from the database.
 *
 * This service reads the JobListing table via Prisma ORM.
 * Business logic (filtering, pagination, ordering) lives here.
 * The controller only handles HTTP request/response; queries belong here.
 *
 * Why a separate module (independent from scraper)?
 *   - Scraper: "collects data" (write — Create/Update)
 *   - Jobs: "serves data" (read — Read)
 *   - Two responsibilities → two modules (SRP)
 */

import { Injectable } from '@nestjs/common';
import { PrismaService } from '@/database/prisma.service';
import type { JobsQueryInput } from '@scrape/shared';
import { logger } from '@/utils/helpers';

// ═══════════════════════════════════════════
// RESPONSE TYPE
// ═══════════════════════════════════════════

/**
 * Paginated response — everything the frontend pagination UI needs.
 *
 * With totalPages and hasNext/hasPrev the frontend decides whether to
 * show the "Next page" button.
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
 * JobListing DTO — job listing data returned to the frontend.
 *
 * We return only the fields the frontend needs, not every DB column.
 * Large fields like description are unnecessary on the list and will
 * be returned on the detail page later.
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
   * Returns job listings paginated, filtered, and ordered.
   *
   * Prisma query shape:
   *   - where: filter conditions (search + location)
   *   - orderBy: ordering
   *   - skip/take: pagination (offset-based)
   *   - select: only required fields (description excluded — large field)
   *
   * @param query Query parameters already validated by Zod
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
          // description and requirements excluded — unneeded in the list view
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
   * Builds Prisma WHERE conditions.
   *
   * If search is given, search in title, company, and location (case-insensitive).
   * Prisma's `contains` + `mode: 'insensitive'` → maps to SQL ILIKE.
   *
   * OR logic: search "React" → matches title OR company OR location
   * AND logic: search + location filters apply together
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
   * Deletes all of the user's job links and match results.
   *
   * Prisma $transaction: atomic guarantee — either both delete or neither does.
   * JobListing rows are not deleted — other users may still see the same listings.
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
   * Deletes a single user-job link and its associated match result.
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
