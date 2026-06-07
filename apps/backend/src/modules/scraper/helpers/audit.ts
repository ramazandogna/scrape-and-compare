/**
 * Scraper Audit — scrape-session tracking via a State Machine.
 *
 * Each scrape run creates an "audit record".
 * This record tracks the full lifecycle of the scraper:
 *
 *   IDLE → SCANNING → EXTRACTING → COMPLETED
 *                ↘ FAILED    ↗ FAILED
 *
 * State Machine rules (copilot-instructions rule #11):
 * ─────────────────────────────────────────────────────────
 * We use explicit states instead of boolean flags.
 * The `VALID_SCRAPER_TRANSITIONS` table defines which transitions
 * are allowed. An invalid transition → throws an error.
 *
 * Why an audit record?
 * ──────────────────
 * 1. Debug: "When did the last scrape run, how many listings did it find?"
 * 2. Monitoring: "Is the error rate climbing? Is LinkedIn blocking us?"
 * 3. History: "How long did last week's scrapes take?"
 * 4. Retry: "Automatically retry keywords that FAILED."
 *
 * @module
 */

import type { PrismaService } from '@/database/prisma.service';
import type { Prisma } from '@scrape/database';
import { ScraperStatus } from '@scrape/database';
import { VALID_SCRAPER_TRANSITIONS } from '@scrape/shared';
import { logger } from '@/utils/helpers';

// ═══════════════════════════════════════════
// STATE TRANSITION VALIDATION
// ═══════════════════════════════════════════

/**
 * Validates a State Machine transition.
 *
 * Looks at the VALID_SCRAPER_TRANSITIONS table:
 *   IDLE → [SCANNING]              ✅ valid
 *   SCANNING → [EXTRACTING, FAILED] ✅ valid
 *   COMPLETED → [SCANNING]          ❌ invalid! throws
 *
 * @param from Current state
 * @param to Target state
 * @throws Error on invalid transition
 */
const validateTransition = (from: ScraperStatus, to: ScraperStatus): void => {
  const allowed = VALID_SCRAPER_TRANSITIONS[from];
  if (!allowed || !allowed.includes(to)) {
    throw new Error(
      `Geçersiz state geçişi: ${from} → ${to}. İzin verilenler: ${allowed?.join(', ') ?? 'yok'}`,
    );
  }
};

// ═══════════════════════════════════════════
// AUDIT RECORD CREATION
// ═══════════════════════════════════════════

/**
 * Creates a new audit record — called at the start of a scrape.
 *
 * Initial state: IDLE (we have done nothing yet).
 * Must immediately transition to SCANNING after this.
 *
 * @param prisma PrismaService instance
 * @param keyword Searched keyword
 * @param location Searched location
 * @returns ID of the created audit record
 */
export const createAudit = async (
  prisma: PrismaService,
  keyword: string,
  location: string,
  userId?: string,
): Promise<string> => {
  const audit = await prisma.scraperAudit.create({
    data: {
      keyword,
      location,
      userId,
      status: ScraperStatus.IDLE,
      startedAt: new Date(),
    },
  });

  logger.info(`[AUDIT] Kayıt oluşturuldu: ${audit.id} — "${keyword}" @ ${location}`);
  return audit.id;
};

// ═══════════════════════════════════════════
// STATE TRANSITIONS
// ═══════════════════════════════════════════

/**
 * Updates the audit record's state — a State Machine transition.
 *
 * This function goes through validateTransition:
 *   1. Reads the current state from the DB
 *   2. Checks whether the transition is valid
 *   3. Updates if valid, otherwise throws
 *
 * @param prisma PrismaService instance
 * @param auditId Audit record UUID
 * @param newStatus Target state
 */
export const transitionAudit = async (
  prisma: PrismaService,
  auditId: string,
  newStatus: ScraperStatus,
): Promise<void> => {
  const current = await prisma.scraperAudit.findUniqueOrThrow({
    where: { id: auditId },
    select: { status: true },
  });

  validateTransition(current.status, newStatus);

  await prisma.scraperAudit.update({
    where: { id: auditId },
    data: { status: newStatus },
  });

  logger.info(`[AUDIT] ${current.status} → ${newStatus}`);
};

// ═══════════════════════════════════════════
// METRIC UPDATES
// ═══════════════════════════════════════════

/** Updates the number of listings found after the search step */
export const updateAuditFound = async (
  prisma: PrismaService,
  auditId: string,
  totalFound: number,
): Promise<void> => {
  await prisma.scraperAudit.update({
    where: { id: auditId },
    data: { totalFound },
  });
};

/** Updates the number of listings extracted after the extract step */
export const updateAuditExtracted = async (
  prisma: PrismaService,
  auditId: string,
  totalExtracted: number,
): Promise<void> => {
  await prisma.scraperAudit.update({
    where: { id: auditId },
    data: { totalExtracted },
  });
};

// ═══════════════════════════════════════════
// COMPLETION / FAILURE
// ═══════════════════════════════════════════

/**
 * Successfully completes the scrape session.
 *
 * Transition: EXTRACTING → COMPLETED
 * Duration is computed; completedAt is set.
 */
export const completeAudit = async (
  prisma: PrismaService,
  auditId: string,
  metrics: {
    totalFound: number;
    totalExtracted: number;
    errorCount: number;
    errorDetails?: Prisma.InputJsonValue;
  },
): Promise<void> => {
  const audit = await prisma.scraperAudit.findUniqueOrThrow({
    where: { id: auditId },
    select: { status: true, startedAt: true },
  });

  validateTransition(audit.status, ScraperStatus.COMPLETED);

  const durationMs = Date.now() - audit.startedAt.getTime();

  await prisma.scraperAudit.update({
    where: { id: auditId },
    data: {
      status: ScraperStatus.COMPLETED,
      totalFound: metrics.totalFound,
      totalExtracted: metrics.totalExtracted,
      errorCount: metrics.errorCount,
      errorDetails: metrics.errorDetails ?? undefined,
      durationMs,
      completedAt: new Date(),
    },
  });

  logger.success(`[AUDIT] COMPLETED — ${metrics.totalFound} bulundu, ${metrics.totalExtracted} çekildi, ${durationMs}ms`);
};

/**
 * Ends the scrape session with an error.
 *
 * Transition: SCANNING|EXTRACTING → FAILED
 * Regardless of the current state (SCANNING or EXTRACTING),
 * the transition to FAILED is valid from both.
 */
export const failAudit = async (
  prisma: PrismaService,
  auditId: string,
  errorDetails: Prisma.InputJsonValue,
): Promise<void> => {
  const audit = await prisma.scraperAudit.findUniqueOrThrow({
    where: { id: auditId },
    select: { status: true, startedAt: true },
  });

  validateTransition(audit.status, ScraperStatus.FAILED);

  const durationMs = Date.now() - audit.startedAt.getTime();

  await prisma.scraperAudit.update({
    where: { id: auditId },
    data: {
      status: ScraperStatus.FAILED,
      errorCount: Array.isArray(errorDetails) ? errorDetails.length : 1,
      errorDetails: errorDetails,
      durationMs,
      completedAt: new Date(),
    },
  });

  const errorCount = Array.isArray(errorDetails) ? errorDetails.length : 1;
  logger.error(`[AUDIT] FAILED — ${errorCount} hata, ${durationMs}ms`);
};
