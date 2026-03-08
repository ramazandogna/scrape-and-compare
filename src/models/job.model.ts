/**
 * Extracted skill — description'dan çıkarılan teknoloji/yetenek.
 */
export interface ExtractedSkill {
  /** Skill adı (ör: "React", "TypeScript") */
  name: string;
  /** Kategori (ör: "frontend", "backend", "devops") */
  category: string;
  /** Ana skill mi? (title/requirements'da geçiyorsa true, sadece description'da geçiyorsa false) */
  isMain: boolean;
}

/**
 * Parse edilmiş maaş bilgisi — ham salary string'inden normalize edilir.
 */
export interface SalaryParsed {
  /** Minimum maaş (TRY cinsinden, aylık) */
  min: number | null;
  /** Maximum maaş (TRY cinsinden, aylık) */
  max: number | null;
  /** Orijinal para birimi */
  currency: 'TRY' | 'USD' | 'EUR';
  /** Orijinal periyot */
  period: 'monthly' | 'yearly';
  /** Ham maaş string'i (orijinal haliyle) */
  raw: string;
}

/**
 * LinkedIn Job Listing — Scraper'dan çıkan ham veri modeli.
 *
 * Her alan LinkedIn'den parse edilir. Bazı alanlar (salary, description)
 * her zaman mevcut olmayabilir, bu yüzden optional.
 */
export interface JobListing {
  /** LinkedIn'deki unique job ID (URL'den parse edilir) */
  id: string;
  /** İş başlığı — "Senior Frontend Engineer" gibi */
  title: string;
  /** Şirket adı */
  company: string;
  /** Lokasyon — "İstanbul, Turkey" gibi */
  location: string;
  /** Maaş bilgisi (LinkedIn'de her zaman gösterilmez) */
  salary: string | null;
  /** Parse edilmiş ve normalize edilmiş maaş bilgisi */
  salaryParsed: SalaryParsed | null;
  /** İş ilanının tam açıklaması */
  description: string | null;
  /** Gereksinimler listesi (description'dan parse edilir) */
  requirements: string[];
  /** Description'dan çıkarılan yetenekler/teknolojiler */
  skills: ExtractedSkill[];
  /** Seniority seviyesi — Entry level, Mid-Senior, Director vs. */
  seniorityLevel: string | null;
  /** İstihdam tipi — Full-time, Part-time, Contract */
  employmentType: string | null;
  /** Doğrudan ilan linki */
  link: string;
  /** "2 days ago", "1 week ago" gibi relative tarih */
  postedDate: string | null;
  /** Scrape edildiği zaman */
  scrapedAt: string;
}

/**
 * Scraper'ın döndüğü sonuç — Discriminated Union pattern.
 *
 * Neden böyle? Çünkü "success" durumunda `data` var ama `error` yok,
 * "error" durumunda `error` var ama `data` yok.
 * TypeScript bu iki durumu compile-time'da ayırt edebilir.
 */
export type ScraperResult =
  | { status: 'success'; data: JobListing[]; query: ScrapeQuery }
  | { status: 'error'; error: ScraperError; query: ScrapeQuery };

/**
 * Scrape sorgusu — hangi keyword ve lokasyonla arandı
 */
export interface ScrapeQuery {
  keyword: string;
  location: string;
  timestamp: string;
}

/**
 * Scraper hata tipleri — her hata kendi zorunlu alanlarıyla gelir.
 * `any` kullanmak yasak, hata da typed olmalı.
 */
export type ScraperError =
  | { code: 'BLOCKED'; message: string; retryAfter?: number }
  | { code: 'CAPTCHA_DETECTED'; url: string }
  | { code: 'TIMEOUT'; timeoutMs: number }
  | { code: 'PARSING_FAILED'; selector: string; html?: string }
  | { code: 'NETWORK_ERROR'; message: string }
  | { code: 'RATE_LIMITED'; resetAt: Date };

/**
 * Scraper için konfigürasyon
 */
export interface ScraperConfig {
  /** Tarayıcı görünür mü (debug için) yoksa arka planda mı (production) */
  headless: boolean;
  /** Tarayıcı aksiyonları arasına yapay gecikme (ms) */
  slowMo: number;
  /** Her keyword için max kaç iş ilanı çekilecek */
  maxJobsPerKeyword: number;
  /** Request'ler arası minimum bekleme (ms) */
  requestDelayMin: number;
  /** Request'ler arası maximum bekleme (ms) */
  requestDelayMax: number;
  /** Her ilanın detay sayfasından description çekilsin mi */
  fetchDetails: boolean;
  /** Detay çekilecek max ilan sayısı */
  maxDetailFetch: number;
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
  errors: ScraperError[];
}
