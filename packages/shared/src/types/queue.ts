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
  /** Scrape'i tetikleyen kullanıcı (legacy çağrılar için opsiyonel) */
  userId?: string;
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

// ═══════════════════════════════════════════
// MATCHER QUEUE TYPES
// ═══════════════════════════════════════════

/**
 * Matcher kuyruğuna gönderilen kullanıcı profili.
 *
 * DB User'ın tamamı değil — sadece scoring için gereken alanlar.
 * Token tasarrufu + privacy: email, name gibi alanlar gönderilmez.
 */
export interface MatcherUserProfile {
  id: string;
  techStack: string[];
  experienceYears: number;
  preferredRoles: string[];
  preferredLocations: string[];
}

/**
 * Matcher kuyruğuna gönderilen iş ilanı özeti.
 *
 * description tam metni göndermiyoruz — skills ve requirements yeterli.
 * Bu tipi Controller (producer) ve Processor (consumer) paylaşır.
 */
export interface MatcherJobSummary {
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
 * Matcher job verisi — kuyruğa atılan payload.
 *
 * Controller bunu oluşturur, Processor bunu okur.
 * batchIndex/totalBatches ilerleme bildirimi için kullanılır.
 */
export interface MatcherJobData {
  user: MatcherUserProfile;
  jobs: MatcherJobSummary[];
  batchIndex: number;
  totalBatches: number;
}

/**
 * Matcher başarılı sonuç — Worker batch'i tamamladığında döner.
 */
export interface MatcherJobCompleted {
  status: 'completed';
  /** Puanlanan ilan sayısı */
  scored: number;
  /** Başarısız ilan sayısı */
  failed: number;
  /** Batch'teki toplam ilan sayısı */
  totalJobs: number;
  /** Ortalama skor (0-100) */
  avgScore: number;
  /** Batch index (0-based) */
  batchIndex: number;
}

/**
 * Matcher başarısız sonuç — Worker batch'i işleyemediğinde döner.
 */
export interface MatcherJobFailed {
  status: 'failed';
  errorCode: string;
  message: string;
  batchIndex: number;
}

/**
 * Matcher job sonucu — Discriminated Union.
 */
export type MatcherJobResult = MatcherJobCompleted | MatcherJobFailed;

/**
 * Matcher ilerleme durumu.
 */
export interface MatcherJobProgress {
  phase: 'SCORING' | 'SAVING';
  message: string;
  batchIndex: number;
  totalBatches: number;
  percentage: number;
}
