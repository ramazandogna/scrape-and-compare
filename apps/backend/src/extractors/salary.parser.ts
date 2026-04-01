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
 */

import type { SalaryParsed, SalaryCurrency, SalaryPeriod } from '@scrape/shared';
import { EXCHANGE_RATES } from '@scrape/shared';

// ═══════════════════════════════════════════
// YARDIMCI FONKSİYONLAR
// ═══════════════════════════════════════════

/** Currency sembol/kısaltma → standart currency kodu */
const detectCurrency = (text: string): SalaryCurrency => {
  const normalized = text.toUpperCase();
  if (normalized.includes('$') || normalized.includes('USD')) return 'USD';
  if (normalized.includes('€') || normalized.includes('EUR')) return 'EUR';
  if (normalized.includes('₺') || normalized.includes('TL') || normalized.includes('TRY')) return 'TRY';
  return 'TRY';
};

/** Yıllık mı aylık mı tespit eder */
const detectPeriod = (text: string): SalaryPeriod | 'unknown' => {
  const lower = text.toLowerCase();
  if (
    lower.includes('yıllık') || lower.includes('yillik') ||
    lower.includes('yearly') || lower.includes('annual') ||
    lower.includes('/yr') || lower.includes('per year') ||
    lower.includes('p.a.')
  ) {
    return 'yearly';
  }
  if (
    lower.includes('aylık') || lower.includes('aylik') ||
    lower.includes('monthly') || lower.includes('/mo') ||
    lower.includes('per month')
  ) {
    return 'monthly';
  }
  // Açık belirtilmemişse → "unknown" olarak döner, heuristic ile belirlenir
  return 'unknown';
};

/**
 * Maaş miktarına göre yıllık/aylık tahmini yapar.
 * Açıkça belirtilmemişse (unknown), büyük değerler yıllık kabul edilir.
 * TRY: 100.000+ → yıllık, USD/EUR: 10.000+ → yıllık
 */
const inferPeriod = (
  value: number,
  currency: SalaryCurrency,
  detected: SalaryPeriod | 'unknown',
): SalaryPeriod => {
  if (detected !== 'unknown') return detected;
  const threshold = currency === 'TRY' ? 100_000 : 10_000;
  return value >= threshold ? 'yearly' : 'monthly';
};

/**
 * Sayı string'ini temizler ve number'a çevirir.
 * "30.000" → 30000, "30,000" → 30000, "50K" → 50000
 */
const parseNumber = (numStr: string): number | null => {
  let cleaned = numStr.trim();

  if (/\d+[kK]$/i.test(cleaned)) {
    cleaned = cleaned.replace(/[kK]$/, '');
    const base = Number(cleaned.replace(/[.,]/g, ''));
    return Number.isNaN(base) ? null : base * 1000;
  }

  if (/\.\d{2}$/.test(cleaned)) {
    cleaned = cleaned.replace(/,/g, '');
  } else if (/\.\d{3}/.test(cleaned)) {
    cleaned = cleaned.replace(/\./g, '');
    cleaned = cleaned.replace(/,/g, '.');
  } else {
    cleaned = cleaned.replace(/,/g, '');
  }

  const num = Number(cleaned);
  return Number.isNaN(num) ? null : num;
};

/** Maaş değerini aylık TRY'ye normalize eder */
const normalizeToMonthlyTRY = (
  value: number,
  currency: SalaryCurrency,
  period: SalaryPeriod,
): number => {
  const rate = EXCHANGE_RATES[currency] ?? 1;
  const inTRY = value * rate;
  return period === 'yearly' ? Math.round(inTRY / 12) : Math.round(inTRY);
};

// ═══════════════════════════════════════════
// ANA PARSER
// ═══════════════════════════════════════════

/** Salary regex pattern'leri — sıralama önemli (spesifik → genel) */
const SALARY_PATTERNS: RegExp[] = [
  /[$€₺]?\s*([\d.,]+)\s*(?:\/\w+)?\s*[-–—]\s*[$€₺]?\s*([\d.,]+)\s*(?:\/\w+)?/,
  /([\d.,]+[kK]?)\s*[-–—]\s*([\d.,]+[kK]?)\s*(?:TL|₺|TRY|USD|\$|EUR|€)/,
  /[$€₺]\s*([\d.,]+[kK]?)\s*[-–—]\s*[$€₺]?\s*([\d.,]+[kK]?)/,
  /[$€₺]\s*([\d.,]+[kK]?)/,
  /([\d.,]+[kK]?)\s*(?:TL|₺|TRY|USD|\$|EUR|€)/,
];

/**
 * Ham maaş string'ini parse eder ve normalize eder.
 *
 * @param rawSalary LinkedIn'den gelen ham maaş string'i
 * @returns Parse edilmiş maaş bilgisi veya null
 */
export const parseSalary = (rawSalary: string | null): SalaryParsed | null => {
  if (!rawSalary || rawSalary.trim().length === 0) return null;

  const text = rawSalary.trim();
  const currency = detectCurrency(text);
  const detectedPeriod = detectPeriod(text);

  for (const pattern of SALARY_PATTERNS) {
    const match = text.match(pattern);
    if (!match) continue;

    const first = match[1];
    const second = match[2];
    if (!first) continue;

    const minRaw = parseNumber(first);
    const maxRaw = second ? parseNumber(second) : null;

    if (minRaw !== null && minRaw < 100) continue;

    // Heuristic: açık period yoksa, miktara göre yıllık/aylık tahmin et
    const referenceValue = maxRaw ?? minRaw;
    const period = referenceValue !== null
      ? inferPeriod(referenceValue, currency, detectedPeriod)
      : (detectedPeriod === 'unknown' ? 'monthly' : detectedPeriod);

    const min = minRaw !== null ? normalizeToMonthlyTRY(minRaw, currency, period) : null;
    const max = maxRaw !== null ? normalizeToMonthlyTRY(maxRaw, currency, period) : null;

    return { min, max, currency, period, raw: text };
  }

  return null;
};

/**
 * Description metninden maaş bilgisi çıkarmaya çalışır.
 *
 * @param description Job açıklaması
 * @returns Parse edilmiş maaş veya null
 */
export const extractSalaryFromDescription = (description: string | null): SalaryParsed | null => {
  if (!description) return null;

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
