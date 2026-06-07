/**
 * Job Mapper Tests — Scraper ↔ Database field conversion tests.
 *
 * What do we test?
 *   1. Field name mapping: id → externalId, link → url
 *   2. Enum casing: 'monthly' → MONTHLY, 'TRY' → TRY
 *   3. Nested → flat: salaryParsed → salaryMin + salaryMax + salaryCurrency + salaryPeriod
 *   4. Null handling: when salaryParsed is null all salary fields are null
 *   5. Create vs Update: update must not contain externalId/url
 */

import { describe, it, expect } from 'vitest';
import { mapJobToCreateInput, mapJobToUpdateInput } from '@/modules/scraper/helpers/job.mapper';
import { SalaryCurrency, SalaryPeriod, JobSource } from '@scrape/database';
import { FULL_JOB, MINIMAL_JOB, USD_YEARLY_JOB } from './fixtures';

describe('mapJobToCreateInput', () => {
  it('alan adlarını doğru map eder (id → externalId, link → url)', () => {
    const result = mapJobToCreateInput(FULL_JOB);

    expect(result.externalId).toBe('linkedin-12345');
    expect(result.url).toBe('https://www.linkedin.com/jobs/view/12345');
    expect(result.title).toBe('Senior Frontend Developer');
    expect(result.company).toBe('Acme Corp');
    expect(result.location).toBe('Istanbul, Turkey');
  });

  it('salary nested objeyi flat alanlara açar', () => {
    const result = mapJobToCreateInput(FULL_JOB);

    expect(result.salaryMin).toBe(40_000);
    expect(result.salaryMax).toBe(60_000);
    expect(result.salaryCurrency).toBe(SalaryCurrency.TRY);
    expect(result.salaryPeriod).toBe(SalaryPeriod.MONTHLY);
  });

  it('USD yearly maaşı doğru map eder', () => {
    const result = mapJobToCreateInput(USD_YEARLY_JOB);

    expect(result.salaryCurrency).toBe(SalaryCurrency.USD);
    expect(result.salaryPeriod).toBe(SalaryPeriod.YEARLY);
    expect(result.salaryMin).toBe(80_000);
    expect(result.salaryMax).toBe(120_000);
  });

  it('salaryParsed null ise tüm salary alanları null olur', () => {
    const result = mapJobToCreateInput(MINIMAL_JOB);

    expect(result.salaryMin).toBeNull();
    expect(result.salaryMax).toBeNull();
    expect(result.salaryCurrency).toBeNull();
    expect(result.salaryPeriod).toBeNull();
  });

  it('skills array JSON tipine dönüşür', () => {
    const result = mapJobToCreateInput(FULL_JOB);

    // skills is a Prisma InputJsonValue — verify it arrives as an array
    expect(Array.isArray(result.skills)).toBe(true);
  });

  it('scrapedAt string → Date objesine çevrilir', () => {
    const result = mapJobToCreateInput(FULL_JOB);

    expect(result.scrapedAt).toBeInstanceOf(Date);
    expect((result.scrapedAt as Date).toISOString()).toBe('2026-03-28T10:00:00.000Z');
  });

  it('source her zaman LINKEDIN olur', () => {
    const result = mapJobToCreateInput(FULL_JOB);
    expect(result.source).toBe(JobSource.LINKEDIN);
  });

  it('opsiyonel alanlar null geçer', () => {
    const result = mapJobToCreateInput(MINIMAL_JOB);

    expect(result.description).toBeNull();
    expect(result.seniorityLevel).toBeNull();
    expect(result.employmentType).toBeNull();
    expect(result.postedDate).toBeNull();
  });
});

describe('mapJobToUpdateInput', () => {
  it('externalId ve url İÇERMEZ (unique key güncellenmez)', () => {
    const result = mapJobToUpdateInput(FULL_JOB);

    // TypeScript should block this at compile time, but verify at runtime as well
    expect(result).not.toHaveProperty('externalId');
    expect(result).not.toHaveProperty('url');
    expect(result).not.toHaveProperty('source');
  });

  it('güncellenebilir alanları içerir', () => {
    const result = mapJobToUpdateInput(FULL_JOB);

    expect(result.title).toBe('Senior Frontend Developer');
    expect(result.company).toBe('Acme Corp');
    expect(result.salaryMin).toBe(40_000);
  });
});
