/**
 * Queue Types — BullMQ kuyruk kontratları.
 *
 * Bu tipler Producer (Controller/CLI) ve Consumer (Worker/Processor) arasındaki
 * type-safe iletişimi garanti eder. Her iki taraf da aynı tipleri kullanır,
 * böylece "yanlış alan gönderme" hataları compile-time'da yakalanır.
 *
 * Tüm tipler runtime'da kullanılmaz — sadece TypeScript compile-time güvenliği sağlar.
 * BullMQ `Queue<ScrapeJobData, ScrapeJobResult>` şeklinde generic tip alır.
 */

import type { ScraperConfig } from './job';

// ═══════════════════════════════════════════
// QUEUE INPUT — Kuyruğa ne atılacak?
// ═══════════════════════════════════════════

/**
 * Scrape job'ının kuyruğa eklenirken gönderilen verisi.
 *
 * Producer (Controller veya CLI) bu tipi kullanarak job oluşturur.
 * Worker bu tipi alır ve scraping işlemini başlatır.
 *
 * @example
 * await queue.add('scrape', {
 *   keywords: ['Frontend Developer', 'React Developer'],
 *   location: 'Turkey',
 * });
 */
export interface ScrapeJobData {
  /** Aranacak keyword listesi (en az 1 zorunlu) */
  keywords: string[];
  /** Arama lokasyonu */
  location: string;
  /** Opsiyonel config override'ları — verilmezse .env default'ları kullanılır */
  config?: Partial<ScraperConfig>;
}

// ═══════════════════════════════════════════
// QUEUE OUTPUT — Worker ne döndürecek?
// ═══════════════════════════════════════════

/**
 * Başarılı scrape sonucu — Worker job'ı tamamladığında döner.
 *
 * BullMQ bu değeri `job.returnvalue` olarak Redis'te saklar.
 * Event consumer veya Controller bu değeri okuyabilir.
 */
export interface ScrapeJobCompleted {
  status: 'completed';
  /** Toplam bulunan iş ilanı sayısı */
  totalJobs: number;
  /** DB'ye yeni eklenen ilan sayısı */
  created: number;
  /** DB'de güncellenen ilan sayısı */
  updated: number;
  /** DB'ye yazılamayan ilan sayısı */
  failed: number;
  /** Scrape süresi (ms) */
  durationMs: number;
  /** İlişkili ScraperAudit kaydının ID'si */
  auditId: string;
}

/**
 * Başarısız scrape sonucu — Worker job'ı işleyemediğinde döner.
 *
 * BullMQ bunu `job.failedReason` olarak saklar.
 * `errorCode` ile hata tipi belirtilir, `message` ile detay verilir.
 */
export interface ScrapeJobFailed {
  status: 'failed';
  /** Hata kodu — ScraperError code'larından biri veya genel hata */
  errorCode: string;
  /** İnsan-okunabilir hata mesajı */
  message: string;
  /** İlişkili ScraperAudit kaydının ID'si (varsa) */
  auditId?: string;
}

/**
 * Scrape job sonucu — Discriminated Union.
 *
 * `status` alanına göre TypeScript doğru tip alanlarını bilir:
 *
 * @example
 * if (result.status === 'completed') {
 *   console.log(result.totalJobs);  // ✅ TypeScript bilir
 * } else {
 *   console.log(result.errorCode);  // ✅ TypeScript bilir
 * }
 */
export type ScrapeJobResult = ScrapeJobCompleted | ScrapeJobFailed;

// ═══════════════════════════════════════════
// QUEUE PROGRESS — İşlem sırasında ne rapor edilecek?
// ═══════════════════════════════════════════

/**
 * Scrape sırasında BullMQ üzerinden bildirilen ilerleme durumu.
 *
 * Worker `job.updateProgress(progress)` ile bu veriyi gönderir.
 * Frontend veya event consumer bu veriyi dinleyebilir.
 *
 * `phase` alanı ScraperAudit state machine ile senkronize çalışır:
 *   SCANNING → search sayfaları taranıyor
 *   EXTRACTING → skill/salary extraction yapılıyor
 */
export interface ScrapeJobProgress {
  /** Mevcut işlem fazı (ScraperAudit state ile uyumlu) */
  phase: 'SCANNING' | 'EXTRACTING';
  /** İnsan-okunabilir durum mesajı */
  message: string;
  /** Yüzde ilerleme (0-100) */
  percentage: number;
}
