/**
 * Scraper Audit — State Machine ile scrape oturumu takibi.
 *
 * Her scrape çalıştırıldığında bir "audit kaydı" oluşturulur.
 * Bu kayıt scraper'ın tüm yaşam döngüsünü takip eder:
 *
 *   IDLE → SCANNING → EXTRACTING → COMPLETED
 *                ↘ FAILED    ↗ FAILED
 *
 * State Machine kuralları (copilot-instructions kural #11):
 * ─────────────────────────────────────────────────────────
 * Boolean bayraklar yerine açık durumlar kullanıyoruz.
 * `VALID_SCRAPER_TRANSITIONS` tablosu hangi geçişlerin
 * izin verildiğini tanımlar. Geçersiz geçiş → hata fırlatır.
 *
 * Neden audit kaydı?
 * ──────────────────
 * 1. Debug: "Son scrape ne zaman çalıştı, kaç ilan buldu?"
 * 2. Monitoring: "Hata oranı artıyor mu? LinkedIn bizi engelliyor mu?"
 * 3. History: "Geçen haftaki scrape'ler ne kadar sürdü?"
 * 4. Retry: "FAILED olan keyword'leri otomatik tekrar dene"
 *
 * @module
 */

import type { PrismaService } from '@/database/prisma.service';
import type { Prisma } from '@scrape/database';
import { ScraperStatus } from '@scrape/database';
import { VALID_SCRAPER_TRANSITIONS } from '@scrape/shared';
import { logger } from '@/utils/helpers';

// ═══════════════════════════════════════════
// STATE GEÇİŞ DOĞRULAMASI
// ═══════════════════════════════════════════

/**
 * State Machine geçişini doğrular.
 *
 * VALID_SCRAPER_TRANSITIONS tablosuna bakar:
 *   IDLE → [SCANNING]              ✅ geçerli
 *   SCANNING → [EXTRACTING, FAILED] ✅ geçerli
 *   COMPLETED → [SCANNING]          ❌ geçersiz! hata fırlatır
 *
 * @param from Mevcut durum
 * @param to Hedef durum
 * @throws Error geçersiz geçişte
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
// AUDIT KAYDI OLUŞTURMA
// ═══════════════════════════════════════════

/**
 * Yeni bir audit kaydı oluşturur — scrape başlangıcında çağrılır.
 *
 * Başlangıç durumu: IDLE (henüz bir şey yapmadık).
 * Hemen ardından SCANNING'e geçirilmelidir.
 *
 * @param prisma PrismaService instance
 * @param keyword Aranan keyword
 * @param location Aranan lokasyon
 * @returns Oluşturulan audit kaydının ID'si
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
// STATE GEÇİŞLERİ
// ═══════════════════════════════════════════

/**
 * Audit kaydının durumunu günceller — State Machine geçişi.
 *
 * Bu fonksiyon validateTransition üzerinden geçer:
 *   1. Mevcut durumu DB'den okur
 *   2. Geçişin geçerli olup olmadığını kontrol eder
 *   3. Geçerliyse günceller, değilse hata fırlatır
 *
 * @param prisma PrismaService instance
 * @param auditId Audit kaydı UUID'si
 * @param newStatus Hedef durum
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
// METRİK GÜNCELLEME
// ═══════════════════════════════════════════

/** Search adımından sonra bulunan ilan sayısını günceller */
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

/** Extract adımından sonra çekilen ilan sayısını günceller */
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
// TAMAMLAMA / HATA
// ═══════════════════════════════════════════

/**
 * Scrape oturumunu başarıyla tamamlar.
 *
 * Transition: EXTRACTING → COMPLETED
 * Süre hesaplanır, completedAt set edilir.
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
 * Scrape oturumunu hatayla sonlandırır.
 *
 * Transition: SCANNING|EXTRACTING → FAILED
 * Hangi durumda olursak olalım (SCANNING veya EXTRACTING),
 * FAILED'a geçiş her ikisinden de geçerlidir.
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
