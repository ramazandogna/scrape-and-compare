/**
 * Test Fixtures — Tüm test dosyalarının ortak kullanacağı sahte veriler.
 *
 * Neden ayrı dosya?
 *   - DRY: Aynı sahte veriyi her test dosyasında yeniden yazmak istemeyiz
 *   - Consistency: Tüm testler aynı referans verileri kullanır
 *   - Maintainability: Tip değişirse tek yerde güncellenir
 */

import type { JobListing } from '@scrape/shared';

/**
 * Tam dolu bir JobListing fixture'ı — tüm alanlar mevcut.
 * `mapJobToCreateInput` ve `mapJobToUpdateInput` testlerinde kullanılır.
 */
export const FULL_JOB: JobListing = {
  id: 'linkedin-12345',
  title: 'Senior Frontend Developer',
  company: 'Acme Corp',
  logoUrl: 'https://media.licdn.com/dms/image/v2/company-logo_100_100/example',
  location: 'Istanbul, Turkey',
  salary: '40.000 - 60.000 TL/ay',
  salaryParsed: {
    min: 40_000,
    max: 60_000,
    currency: 'TRY',
    period: 'monthly',
    raw: '40.000 - 60.000 TL/ay',
  },
  description: 'React ve TypeScript ile modern web uygulamaları geliştirme.',
  requirements: ['React', 'TypeScript', '3+ yıl deneyim'],
  skills: [
    { name: 'React', category: 'frontend', isMain: true },
    { name: 'TypeScript', category: 'language', isMain: true },
    { name: 'CSS', category: 'frontend', isMain: false },
  ],
  seniorityLevel: 'Mid-Senior level',
  employmentType: 'Full-time',
  link: 'https://www.linkedin.com/jobs/view/12345',
  postedDate: '2 days ago',
  scrapedAt: '2026-03-28T10:00:00.000Z',
};

/**
 * Minimum dolu bir JobListing — opsiyonel alanlar null.
 * "Salary yok, description yok" durumunu test eder.
 */
export const MINIMAL_JOB: JobListing = {
  id: 'linkedin-99999',
  title: 'Junior Developer',
  company: 'Startup Inc',
  logoUrl: null,
  location: 'Remote',
  salary: null,
  salaryParsed: null,
  description: null,
  requirements: [],
  skills: [],
  seniorityLevel: null,
  employmentType: null,
  link: 'https://www.linkedin.com/jobs/view/99999',
  postedDate: null,
  scrapedAt: '2026-03-28T12:00:00.000Z',
};

/**
 * USD maaşlı ve yıllık periyotlu iş — currency/period mapping testi için.
 */
export const USD_YEARLY_JOB: JobListing = {
  ...FULL_JOB,
  id: 'linkedin-77777',
  salary: '$80,000 - $120,000/year',
  salaryParsed: {
    min: 80_000,
    max: 120_000,
    currency: 'USD',
    period: 'yearly',
    raw: '$80,000 - $120,000/year',
  },
  link: 'https://www.linkedin.com/jobs/view/77777',
};
