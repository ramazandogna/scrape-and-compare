/**
 * Job Persistence — Prisma upsert ile DB'ye yazma.
 *
 * Neden upsert?
 * ─────────────
 * Scraper aynı ilanı birden fazla kez bulabilir (farklı keyword'lerle aranır).
 * `INSERT` yaparsak duplicate key hatası alırız.
 * `upsert` = "varsa güncelle, yoksa oluştur" — tek atomik işlem.
 *
 * Prisma upsert:
 *   where:  { externalId: "..." }  → Bu ilan daha önce kaydedilmiş mi?
 *   create: { ... }                → Hayır → INSERT
 *   update: { ... }                → Evet  → UPDATE (yeni description, salary vb.)
 *
 * Performans notu:
 * Prisma henüz batch upsert desteklemiyor (createMany var ama upsertMany yok).
 * Bu yüzden Promise.allSettled ile paralel upsert yapıyoruz.
 * allSettled kullanmamızın nedeni: tek bir hatalı kayıt tüm batch'i durdurmasın.
 *
 * @module
 */

import type { PrismaService } from '@/database/prisma.service';
import type { JobListing } from '@scrape/shared';
import { mapJobToCreateInput, mapJobToUpdateInput } from './job.mapper';
import { logger } from '@/utils/helpers';

// ═══════════════════════════════════════════
// RESULT TİPLERİ (Discriminated Union)
// ═══════════════════════════════════════════

/**
 * Tek bir job'un persist sonucu — discriminated union.
 *
 * Neden optional props değil de union?
 * `{ success: boolean; error?: string }` yazarsak:
 *   - success=true olduğunda error'a erişim hâlâ mümkün (undefined ama erişilebilir)
 *   - TypeScript seni korumaz
 *
 * Union ile:
 *   - status='created' → error alanı YOKTUR (compile-time garantisi)
 *   - status='failed'  → error alanı ZORUNLUDUR
 */
export type JobPersistResult =
  | { status: 'created'; externalId: string }
  | { status: 'updated'; externalId: string }
  | { status: 'failed'; externalId: string; error: string };

/** Batch upsert özet raporu */
export interface UpsertSummary {
  total: number;
  created: number;
  updated: number;
  failed: number;
  errors: Array<{ externalId: string; error: string }>;
}

// ═══════════════════════════════════════════
// TEK JOB UPSERT
// ═══════════════════════════════════════════

/**
 * Tek bir job'u DB'ye upsert eder.
 *
 * externalId unique key olarak kullanılır:
 *   - Yoksa → CREATE (yeni ilan)
 *   - Varsa → UPDATE (description, salary vb. güncellenmiş olabilir)
 *
 * @param prisma PrismaService instance
 * @param job Scraper'dan gelen enriched JobListing
 * @returns Persist sonucu (created / updated / failed)
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
      return { status: 'updated', externalId: job.id };
    }

    await prisma.jobListing.create({
      data: mapJobToCreateInput(job),
    });
    return { status: 'created', externalId: job.id };
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown DB error';
    return { status: 'failed', externalId: job.id, error: message };
  }
};

// ═══════════════════════════════════════════
// BATCH UPSERT
// ═══════════════════════════════════════════

/**
 * Birden fazla job'u paralel olarak DB'ye upsert eder.
 *
 * Promise.allSettled kullanılır çünkü:
 *   - Promise.all: Tek bir hata TÜM batch'i iptal eder
 *   - Promise.allSettled: Her job bağımsız çalışır, hatalar izole kalır
 *
 * @param prisma PrismaService instance
 * @param jobs Scraper'dan gelen enriched JobListing dizisi
 * @returns Özet rapor (kaç created, updated, failed)
 */
export const upsertJobs = async (
  prisma: PrismaService,
  jobs: JobListing[],
): Promise<UpsertSummary> => {
  if (jobs.length === 0) {
    return { total: 0, created: 0, updated: 0, failed: 0, errors: [] };
  }

  logger.info(`[DB] ${jobs.length} job upsert ediliyor...`);
  const startTime = Date.now();

  const settled = await Promise.allSettled(
    jobs.map((job) => upsertSingleJob(prisma, job)),
  );

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

/** allSettled sonuçlarından summary raporu oluşturur */
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
