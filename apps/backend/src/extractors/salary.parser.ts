/**
 * Salary Parser — normalizes raw salary strings.
 *
 * Supported formats:
 * - "30.000 TL", "30,000 TL", "30000₺"
 * - "$5,000", "5.000 USD", "5000$"
 * - "€4.000", "4,000 EUR", "4000€"
 * - "50K-80K USD", "50.000-80.000 TL"
 * - "yıllık 500.000₺", "yearly $60,000"
 * - LinkedIn card format: "$80,000.00/yr - $120,000.00/yr"
 *
 * Normalization:
 * - All values are converted to TRY (static rate)
 * - Yearly salaries are divided into monthly
 */

import type { SalaryParsed, SalaryCurrency, SalaryPeriod } from '@scrape/shared';
import { EXCHANGE_RATES } from '@scrape/shared';

// ═══════════════════════════════════════════
// HELPER FUNCTIONS
// ═══════════════════════════════════════════

/** Currency symbol/abbreviation → standard currency code */
const detectCurrency = (text: string): SalaryCurrency => {
  const normalized = text.toUpperCase();
  if (normalized.includes('$') || normalized.includes('USD')) return 'USD';
  if (normalized.includes('€') || normalized.includes('EUR')) return 'EUR';
  if (normalized.includes('₺') || normalized.includes('TL') || normalized.includes('TRY')) return 'TRY';
  return 'TRY';
};

/** Detects whether the value is yearly or monthly */
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
  // If not explicitly stated → returns "unknown", determined heuristically
  return 'unknown';
};

/**
 * Infers yearly/monthly based on the salary amount.
 * When not explicitly stated (unknown), large values are treated as yearly.
 * TRY: 100,000+ → yearly, USD/EUR: 10,000+ → yearly
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
 * Cleans a number string and converts to a number.
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

/** Normalizes the salary value to monthly TRY */
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
// MAIN PARSER
// ═══════════════════════════════════════════

/** Salary regex patterns — order matters (specific → general) */
const SALARY_PATTERNS: RegExp[] = [
  /[$€₺]?\s*([\d.,]+)\s*(?:\/\w+)?\s*[-–—]\s*[$€₺]?\s*([\d.,]+)\s*(?:\/\w+)?/,
  /([\d.,]+[kK]?)\s*[-–—]\s*([\d.,]+[kK]?)\s*(?:TL|₺|TRY|USD|\$|EUR|€)/,
  /[$€₺]\s*([\d.,]+[kK]?)\s*[-–—]\s*[$€₺]?\s*([\d.,]+[kK]?)/,
  /[$€₺]\s*([\d.,]+[kK]?)/,
  /([\d.,]+[kK]?)\s*(?:TL|₺|TRY|USD|\$|EUR|€)/,
];

/**
 * Parses and normalizes a raw salary string.
 *
 * @param rawSalary Raw salary string from LinkedIn
 * @returns Parsed salary info or null
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

    // Heuristic: when no explicit period, infer yearly/monthly from the amount
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
 * Attempts to extract salary information from a description text.
 *
 * @param description Job description
 * @returns Parsed salary or null
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
