/**
 * Job Persistence — writes to the DB via Prisma upsert.
 *
 * Why upsert?
 * ─────────────
 * The scraper may find the same listing multiple times (searched via different keywords).
 * `INSERT` would cause a duplicate-key error.
 * `upsert` = "update if exists, otherwise create" — a single atomic operation.
 *
 * Prisma upsert:
 *   where:  { externalId: "..." }  → has this listing been saved before?
 *   create: { ... }                → no → INSERT
 *   update: { ... }                → yes → UPDATE (new description, salary, etc.)
 *
 * Performance note:
 * Prisma does not yet support batch upsert (createMany exists, but upsertMany does not).
 * Therefore we do parallel upserts via Promise.allSettled.
 * We use allSettled so a single failing record does not abort the whole batch.
 *
 * @module
 */

import type { PrismaService } from '@/database/prisma.service';
import type { JobListing } from '@scrape/shared';
import { mapJobToCreateInput, mapJobToUpdateInput } from './job.mapper';
import { logger } from '@/utils/helpers';

// ═══════════════════════════════════════════
// RESULT TYPES (Discriminated Union)
// ═══════════════════════════════════════════

/**
 * Persist result for a single job — discriminated union.
 *
 * Why a union instead of optional props?
 * If you write `{ success: boolean; error?: string }`:
 *   - When success=true, error is still accessible (undefined but reachable)
 *   - TypeScript does not protect you
 *
 * With a union:
 *   - status='created' → error field DOES NOT EXIST (compile-time guarantee)
 *   - status='failed'  → error field is REQUIRED
 */
export type JobPersistResult =
  | { status: 'created'; externalId: string; jobId: string }
  | { status: 'updated'; externalId: string; jobId: string }
  | { status: 'failed'; externalId: string; error: string };

/** Batch upsert summary report */
export interface UpsertSummary {
  total: number;
  created: number;
  updated: number;
  failed: number;
  errors: Array<{ externalId: string; error: string }>;
}

interface UserJobLinkOptions {
  userId?: string;
  auditId?: string;
}

// ═══════════════════════════════════════════
// SINGLE JOB UPSERT
// ═══════════════════════════════════════════

/**
 * Upserts a single job into the DB.
 *
 * externalId is used as the unique key:
 *   - Missing → CREATE (new listing)
 *   - Present → UPDATE (description, salary, etc. may have changed)
 *
 * @param prisma PrismaService instance
 * @param job Enriched JobListing from the scraper
 * @returns Persist result (created / updated / failed)
 */
const upsertSingleJob = async (
  prisma: PrismaService,
  job: JobListing,
): Promise<JobPersistResult> => {
  try {
    const existing = await prisma.jobListing.findUnique({
      where: { externalId: job.id },
      select: { id: true },
    });

    if (existing) {
      await prisma.jobListing.update({
        where: { externalId: job.id },
        data: mapJobToUpdateInput(job),
      });
      return { status: 'updated', externalId: job.id, jobId: existing.id };
    }

    const created = await prisma.jobListing.create({
      data: mapJobToCreateInput(job),
      select: { id: true },
    });
    return { status: 'created', externalId: job.id, jobId: created.id };
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown DB error';
    return { status: 'failed', externalId: job.id, error: message };
  }
};

// ═══════════════════════════════════════════
// BATCH UPSERT
// ═══════════════════════════════════════════

/**
 * Upserts multiple jobs into the DB in parallel.
 *
 * Promise.allSettled is used because:
 *   - Promise.all: a single failure aborts THE ENTIRE batch
 *   - Promise.allSettled: each job runs independently, failures stay isolated
 *
 * @param prisma PrismaService instance
 * @param jobs Array of enriched JobListing values from the scraper
 * @returns Summary report (how many created, updated, failed)
 */
export const upsertJobs = async (
  prisma: PrismaService,
  jobs: JobListing[],
  linkOptions?: UserJobLinkOptions,
): Promise<UpsertSummary> => {
  if (jobs.length === 0) {
    return { total: 0, created: 0, updated: 0, failed: 0, errors: [] };
  }

  logger.info(`[DB] ${jobs.length} job upsert ediliyor...`);
  const startTime = Date.now();

  const settled = await Promise.allSettled(
    jobs.map((job) => upsertSingleJob(prisma, job)),
  );

  await linkJobsToUser(prisma, settled, linkOptions);

  const summary = buildSummary(settled);
  const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);

  logger.success(`[DB] Upsert tamamlandı (${elapsed}s)`, {
    total: summary.total,
    created: summary.created,
    updated: summary.updated,
    failed: summary.failed,
  });

  if (summary.failed > 0) {
    logger.warn(`[DB] ${summary.failed} kayıt başarısız:`, {
      errors: summary.errors.slice(0, 5),
    });
  }

  return summary;
};

// ═══════════════════════════════════════════
// SUMMARY BUILDER
// ═══════════════════════════════════════════

/** Builds a summary report from allSettled results */
const buildSummary = (
  results: PromiseSettledResult<JobPersistResult>[],
): UpsertSummary => {
  let created = 0;
  let updated = 0;
  let failed = 0;
  const errors: Array<{ externalId: string; error: string }> = [];

  for (const result of results) {
    if (result.status === 'rejected') {
      failed++;
      errors.push({ externalId: 'unknown', error: String(result.reason) });
      continue;
    }

    const value = result.value;
    switch (value.status) {
      case 'created':
        created++;
        break;
      case 'updated':
        updated++;
        break;
      case 'failed':
        failed++;
        errors.push({ externalId: value.externalId, error: value.error });
        break;
    }
  }

  return {
    total: results.length,
    created,
    updated,
    failed,
    errors,
  };
};

const isSuccessfulPersist = (
  result: PromiseSettledResult<JobPersistResult>,
): result is PromiseFulfilledResult<Extract<JobPersistResult, { status: 'created' | 'updated' }>> => {
  return (
    result.status === 'fulfilled' &&
    (result.value.status === 'created' || result.value.status === 'updated')
  );
};

const linkJobsToUser = async (
  prisma: PrismaService,
  results: PromiseSettledResult<JobPersistResult>[],
  options?: UserJobLinkOptions,
): Promise<void> => {
  if (!options?.userId) return;

  const links = results.filter(isSuccessfulPersist);
  if (links.length === 0) return;

  await Promise.allSettled(
    links.map((result) =>
      prisma.userJobListing.upsert({
        where: {
          userId_jobId: {
            userId: options.userId!,
            jobId: result.value.jobId,
          },
        },
        create: {
          userId: options.userId!,
          jobId: result.value.jobId,
          auditId: options.auditId,
        },
        update: {
          auditId: options.auditId,
        },
      }),
    ),
  );
};
