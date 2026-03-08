/**
 * Salary Parser — Ham maaş string'lerini normalize eder.
 *
 * Desteklenen formatlar:
 * - "30.000 TL", "30,000 TL", "30000₺"
 * - "$5,000", "5.000 USD", "5000$"
 * - "€4.000", "4,000 EUR", "4000€"
 * - "50K-80K USD", "50.000-80.000 TL"
 * - "yıllık 500.000₺", "yearly $60,000"
 * - LinkedIn card format: "$80,000.00/yr - $120,000.00/yr"
 *
 * Normalize:
 * - Tüm değerler TRY'ye çevrilir (statik kur)
 * - Yıllık maaşlar aylığa bölünür
 *
 * Statik kurlar (yaklaşık, 2025 Q1):
 * - 1 USD ≈ 35 TRY
 * - 1 EUR ≈ 38 TRY
 */

import type { SalaryParsed } from '@/models/job.model';

// ═══════════════════════════════════════════
// SABİTLER
// ═══════════════════════════════════════════

/** Statik döviz kurları (TRY cinsinden) */
const EXCHANGE_RATES: Record<string, number> = {
  TRY: 1,
  USD: 35,
  EUR: 38,
};

// ═══════════════════════════════════════════
// YARDIMCI FONKSİYONLAR
// ═══════════════════════════════════════════

/**
 * Currency sembol/kısaltma → standart currency kodu.
 *
 * @param text İçinden currency tespit edilecek metin
 * @returns Currency kodu
 */
const detectCurrency = (text: string): 'TRY' | 'USD' | 'EUR' => {
  const normalized = text.toUpperCase();

  if (normalized.includes('$') || normalized.includes('USD')) return 'USD';
  if (normalized.includes('€') || normalized.includes('EUR')) return 'EUR';
  if (normalized.includes('₺') || normalized.includes('TL') || normalized.includes('TRY')) return 'TRY';

  // Default: TRY (Türkiye odaklı scraper)
  return 'TRY';
};

/**
 * Yıllık mı aylık mı tespit eder.
 *
 * @param text İçinden periyot tespit edilecek metin
 * @returns Periyot
 */
const detectPeriod = (text: string): 'monthly' | 'yearly' => {
  const lower = text.toLowerCase();

  if (
    lower.includes('yıllık') ||
    lower.includes('yillik') ||
    lower.includes('yearly') ||
    lower.includes('annual') ||
    lower.includes('/yr') ||
    lower.includes('per year') ||
    lower.includes('p.a.')
  ) {
    return 'yearly';
  }

  return 'monthly';
};

/**
 * Sayı string'ini temizler ve number'a çevirir.
 * "30.000" → 30000, "30,000" → 30000, "50K" → 50000
 *
 * @param numStr Ham sayı string'i
 * @returns Parse edilmiş sayı veya null
 */
const parseNumber = (numStr: string): number | null => {
  let cleaned = numStr.trim();

  // "50K" → "50000"
  if (/\d+[kK]$/i.test(cleaned)) {
    cleaned = cleaned.replace(/[kK]$/, '');
    const base = Number(cleaned.replace(/[.,]/g, ''));
    return Number.isNaN(base) ? null : base * 1000;
  }

  // Binlik ayraç tespiti:
  // "30.000" (TR format) vs "30,000" (EN format) vs "30000.00" (decimal)
  // Eğer sonda .XX varsa → decimal point
  if (/\.\d{2}$/.test(cleaned)) {
    // "$80,000.00" format — virgüller binlik
    cleaned = cleaned.replace(/,/g, '');
  } else if (/\.\d{3}/.test(cleaned)) {
    // "30.000" TR format — noktalar binlik
    cleaned = cleaned.replace(/\./g, '');
    cleaned = cleaned.replace(/,/g, '.');
  } else {
    // "30,000" EN format veya "30000"
    cleaned = cleaned.replace(/,/g, '');
  }

  const num = Number(cleaned);
  return Number.isNaN(num) ? null : num;
};

/**
 * Maaş değerini aylık TRY'ye normalize eder.
 *
 * @param value Orijinal değer
 * @param currency Para birimi
 * @param period Periyot
 * @returns Aylık TRY değeri
 */
const normalizeToMonthlyTRY = (
  value: number,
  currency: 'TRY' | 'USD' | 'EUR',
  period: 'monthly' | 'yearly',
): number => {
  const rate = EXCHANGE_RATES[currency] ?? 1;
  const inTRY = value * rate;
  return period === 'yearly' ? Math.round(inTRY / 12) : Math.round(inTRY);
};

// ═══════════════════════════════════════════
// ANA PARSER
// ═══════════════════════════════════════════

/**
 * Salary regex pattern'leri — sıralama önemli (spesifik → genel)
 *
 * Her pattern bir [min, max?] capture grubu döndürür.
 */
const SALARY_PATTERNS: RegExp[] = [
  // Range: "$80,000.00/yr - $120,000.00/yr" (LinkedIn card format)
  /[$€₺]?\s*([\d.,]+)\s*(?:\/\w+)?\s*[-–—]\s*[$€₺]?\s*([\d.,]+)\s*(?:\/\w+)?/,

  // Range: "30.000 - 50.000 TL", "30.000-50.000₺"
  /([\d.,]+[kK]?)\s*[-–—]\s*([\d.,]+[kK]?)\s*(?:TL|₺|TRY|USD|\$|EUR|€)/,

  // Range with currency prefix: "$5,000 - $8,000"
  /[$€₺]\s*([\d.,]+[kK]?)\s*[-–—]\s*[$€₺]?\s*([\d.,]+[kK]?)/,

  // Single value: "30.000 TL", "₺30.000", "$5000"
  /[$€₺]\s*([\d.,]+[kK]?)/,
  /([\d.,]+[kK]?)\s*(?:TL|₺|TRY|USD|\$|EUR|€)/,
];

/**
 * Ham maaş string'ini parse eder ve normalize eder.
 *
 * @param rawSalary LinkedIn'den gelen ham maaş string'i
 * @returns Parse edilmiş maaş bilgisi veya null (parse edilemezse)
 */
export const parseSalary = (rawSalary: string | null): SalaryParsed | null => {
  if (!rawSalary || rawSalary.trim().length === 0) return null;

  const text = rawSalary.trim();
  const currency = detectCurrency(text);
  const period = detectPeriod(text);

  // Pattern'leri sırayla dene
  for (const pattern of SALARY_PATTERNS) {
    const match = text.match(pattern);
    if (!match) continue;

    const first = match[1];
    const second = match[2];

    if (!first) continue;

    const minRaw = parseNumber(first);
    const maxRaw = second ? parseNumber(second) : null;

    // Çok küçük sayılar geçersiz (ör: "3" tek başına maaş değil)
    if (minRaw !== null && minRaw < 100) continue;

    const min = minRaw !== null ? normalizeToMonthlyTRY(minRaw, currency, period) : null;
    const max = maxRaw !== null ? normalizeToMonthlyTRY(maxRaw, currency, period) : null;

    return {
      min,
      max,
      currency,
      period,
      raw: text,
    };
  }

  return null;
};

/**
 * Description metninden maaş bilgisi çıkarmaya çalışır.
 * Card'da salary yoksa description'daki maaş bilgisini arar.
 *
 * @param description Job açıklaması
 * @returns Parse edilmiş maaş veya null
 */
export const extractSalaryFromDescription = (description: string | null): SalaryParsed | null => {
  if (!description) return null;

  // Maaş ile ilgili cümleleri bul
  const salaryKeywords = [
    /maaş[ı]?\s*[:;]?\s*([^\n.]{5,80})/i,
    /ücret[i]?\s*[:;]?\s*([^\n.]{5,80})/i,
    /salary\s*[:;]?\s*([^\n.]{5,80})/i,
    /compensation\s*[:;]?\s*([^\n.]{5,80})/i,
    /pay\s*(?:range)?\s*[:;]?\s*([^\n.]{5,80})/i,
  ];

  for (const keyword of salaryKeywords) {
    const contextMatch = description.match(keyword);
    if (!contextMatch?.[1]) continue;

    const result = parseSalary(contextMatch[1]);
    if (result) return result;
  }

  return null;
};
