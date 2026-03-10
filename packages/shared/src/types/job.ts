/**
 * Job Listing Types — İş ilanı veri modelleri.
 *
 * Bu tipler scraper'dan DB'ye, DB'den frontend'e kadar tüm katmanlarda kullanılır.
 * "Types ARE Documentation" prensibi: tip sistemi kodu okumak için yeterli olmalı.
 */

/**
 * Extracted skill — description'dan çıkarılan teknoloji/yetenek.
 *
 * İki kategori var:
 * - Main: title veya requirements'da geçen (ilanın ana gereksinimleri)
 * - Side: sadece description'da geçen (nice-to-have veya ekosistem bilgisi)
 */
export interface ExtractedSkill {
  /** Skill adı (ör: "React", "TypeScript") */
  name: string;
  /** Kategori (ör: "frontend", "backend", "devops") */
  category: string;
  /** Ana skill mi? title/requirements'da geçiyorsa true */
  isMain: boolean;
}

/**
 * Parse edilmiş maaş bilgisi — ham salary string'inden normalize edilir.
 * Tüm değerler TRY/aylık'a çevrilir.
 */
export interface SalaryParsed {
  /** Minimum maaş (TRY cinsinden, aylık) */
  min: number | null;
  /** Maximum maaş (TRY cinsinden, aylık) */
  max: number | null;
  /** Orijinal para birimi */
  currency: SalaryCurrency;
  /** Orijinal periyot */
  period: SalaryPeriod;
  /** Ham maaş string'i (orijinal haliyle) */
  raw: string;
}

/**
 * LinkedIn Job Listing — Scraper'dan çıkan veri modeli.
 *
 * Bu interface hem scraper output'u hem de DB'ye yazılacak
 * verinin şeklini tanımlar. Bazı alanlar (salary, description)
 * her zaman mevcut olmayabilir.
 */
export interface JobListing {
  /** LinkedIn'deki unique job ID (URL'den parse edilir) */
  id: string;
  /** İş başlığı */
  title: string;
  /** Şirket adı */
  company: string;
  /** Lokasyon */
  location: string;
  /** Ham maaş bilgisi (LinkedIn'de her zaman gösterilmez) */
  salary: string | null;
  /** Parse edilmiş ve normalize edilmiş maaş bilgisi */
  salaryParsed: SalaryParsed | null;
  /** İş ilanının tam açıklaması */
  description: string | null;
  /** Gereksinimler listesi */
  requirements: string[];
  /** Description'dan çıkarılan yetenekler/teknolojiler */
  skills: ExtractedSkill[];
  /** Seniority seviyesi */
  seniorityLevel: string | null;
  /** İstihdam tipi */
  employmentType: string | null;
  /** Doğrudan ilan linki */
  link: string;
  /** Relative tarih ("2 days ago" gibi) */
  postedDate: string | null;
  /** Scrape edildiği zaman */
  scrapedAt: string;
}

/**
 * Scrape sorgusu — hangi keyword ve lokasyonla arandı
 */
export interface ScrapeQuery {
  keyword: string;
  location: string;
  timestamp: string;
}

/**
 * Tam scrape output'u — JSON dosyasına yazılacak format
 */
export interface ScrapeOutput {
  scrapeTimestamp: string;
  query: {
    keywords: string[];
    location: string;
  };
  totalJobs: number;
  jobs: JobListing[];
  errors: ScraperErrorLegacy[];
}

/**
 * Scraper konfigürasyonu — browser ve rate limit ayarları
 */
export interface ScraperConfig {
  /** Tarayıcı görünür mü yoksa arka planda mı */
  headless: boolean;
  /** Aksiyon arası yapay gecikme (ms) */
  slowMo: number;
  /** Her keyword için max iş ilanı sayısı */
  maxJobsPerKeyword: number;
  /** Request arası minimum bekleme (ms) */
  requestDelayMin: number;
  /** Request arası maximum bekleme (ms) */
  requestDelayMax: number;
  /** Detay sayfası çekilsin mi */
  fetchDetails: boolean;
  /** Detay çekilecek max ilan sayısı */
  maxDetailFetch: number;
}

// ═══════════════════════════════════════════
// ENUMS & CONSTANTS
// ═══════════════════════════════════════════

/** Para birimi */
export type SalaryCurrency = 'TRY' | 'USD' | 'EUR';

/** Maaş periyodu */
export type SalaryPeriod = 'monthly' | 'yearly';

/** İş ilanı kaynağı */
export type JobSource = 'LINKEDIN' | 'INDEED' | 'GLASSDOOR';

/**
 * Scraper State Machine — boolean flag'ler yerine açık durumlar.
 * copilot-instructions kuralı #11: "Use a rigid State Machine"
 */
export type ScraperStatus = 'IDLE' | 'SCANNING' | 'EXTRACTING' | 'COMPLETED' | 'FAILED';

/**
 * Legacy scraper error — mevcut scraper uyumluluğu için.
 * İleride ScraperError discriminated union'a geçilecek.
 */
export type ScraperErrorLegacy =
  | { code: 'BLOCKED'; message: string; retryAfter?: number }
  | { code: 'CAPTCHA_DETECTED'; url: string }
  | { code: 'TIMEOUT'; timeoutMs: number }
  | { code: 'PARSING_FAILED'; selector: string; html?: string }
  | { code: 'NETWORK_ERROR'; message: string }
  | { code: 'RATE_LIMITED'; resetAt: Date };
