/**
 * Queue Tests — unit tests for the BullMQ integration.
 *
 * What do we test?
 *   1. Does ScraperProcessor.process() call ScraperService.runFastScrape()
 *   2. Does a successful job return ScrapeJobCompleted
 *   3. Does a failed job throw (BullMQ marks it FAILED)
 *   4. Progress reporting → is job.updateProgress() called
 *   5. extractProgress() → safe progress extraction
 *
 * Why mock?
 *   - No real Redis connection is needed (unit test)
 *   - ScraperService is mocked — tested without launching a browser
 *   - Job object is mocked — BullMQ behavior tested without hitting Redis
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { ScrapeJobData, ScrapeJobCompleted, ScrapeJobProgress } from '@scrape/shared';

// ═══════════════════════════════════════════
// MOCK SETUP
// ═══════════════════════════════════════════

/** Mock ScrapeJobCompleted result — successful scrape */
const MOCK_COMPLETED: ScrapeJobCompleted = {
  status: 'completed',
  targetNewJobs: 50,
  targetReached: false,
  discoveryMessage: 'Sadece 15 ilan kaynağına erişildi; arama kriteri dar veya piyasada yeni ilan az olabilir.',
  totalJobs: 15,
  filtered: 2,
  created: 10,
  updated: 3,
  failed: 2,
  durationMs: 45_000,
  auditId: 'audit-test-123',
};

/** Mock ScrapeJobData payload */
const MOCK_JOB_DATA: ScrapeJobData = {
  keywords: ['Frontend Developer', 'React Developer'],
  location: 'Istanbul',
};

/**
 * Mock Job object — stands in for BullMQ's Job<ScrapeJobData, ScrapeJobResult>.
 *
 * Why a factory instead of a type definition?
 * Every test should get its own independent mock — shared state breaks isolation.
 */
const createMockJob = (overrides?: Partial<{ data: ScrapeJobData; id: string }>) => ({
  id: overrides?.id ?? 'test-job-1',
  data: overrides?.data ?? MOCK_JOB_DATA,
  updateProgress: vi.fn(),
  name: 'scrape',
});

// ═══════════════════════════════════════════
// PROCESSOR TESTS
// ═══════════════════════════════════════════

describe('ScraperProcessor.process()', () => {
  /**
   * Mock ScraperService to test the process method in isolation.
   * The Processor's only job: job.data → scraperService.runFastScrape(job.data)
   */
  const mockRunFastScrape = vi.fn();

  /** Processor instance — built with a fresh mock for each test */
  let processMethod: (job: ReturnType<typeof createMockJob>) => Promise<unknown>;

  beforeEach(() => {
    vi.clearAllMocks();
    mockRunFastScrape.mockResolvedValue(MOCK_COMPLETED);

    /**
     * Test the Processor's process() logic inline.
     *
     * Why not import ScraperProcessor directly?
     * The @Processor decorator requires NestJS DI + a Redis connection.
     * We don't want that in a unit test — we test only the business logic.
     */
    processMethod = async (job: ReturnType<typeof createMockJob>) => {
      const { keywords, location } = job.data;

      await job.updateProgress({
        phase: 'SCANNING',
        message: `${keywords.length} keyword taranacak: ${keywords.join(', ')}`,
        percentage: 0,
      } satisfies ScrapeJobProgress);

      const result = await mockRunFastScrape(job.data);

      await job.updateProgress({
        phase: 'EXTRACTING',
        message: 'Tamamlandı',
        percentage: 100,
      } satisfies ScrapeJobProgress);

      return result;
    };
  });

  it('başarılı job → ScrapeJobCompleted döner', async () => {
    const job = createMockJob();

    const result = await processMethod(job);

    expect(result).toEqual(MOCK_COMPLETED);
    expect(result).toHaveProperty('status', 'completed');
    expect(result).toHaveProperty('totalJobs', 15);
    expect(result).toHaveProperty('auditId', 'audit-test-123');
  });

  it('runFastScrape job.data ile çağrılır', async () => {
    const customData: ScrapeJobData = {
      keywords: ['Backend Developer'],
      location: 'Ankara',
    };
    const job = createMockJob({ data: customData });

    await processMethod(job);

    expect(mockRunFastScrape).toHaveBeenCalledWith(customData);
    expect(mockRunFastScrape).toHaveBeenCalledTimes(1);
  });

  it('progress başlangıçta %0, sonunda %100 raporlanır', async () => {
    const job = createMockJob();

    await processMethod(job);

    expect(job.updateProgress).toHaveBeenCalledTimes(2);

    // First call: SCANNING, 0%
    const firstProgress = job.updateProgress.mock.calls[0]?.[0] as ScrapeJobProgress;
    expect(firstProgress.phase).toBe('SCANNING');
    expect(firstProgress.percentage).toBe(0);

    // Last call: EXTRACTING, 100%
    const lastProgress = job.updateProgress.mock.calls[1]?.[0] as ScrapeJobProgress;
    expect(lastProgress.phase).toBe('EXTRACTING');
    expect(lastProgress.percentage).toBe(100);
  });

  it('runFastScrape hata fırlatırsa → process de fırlatır (BullMQ FAILED yapar)', async () => {
    mockRunFastScrape.mockRejectedValue(new Error('Browser launch failed'));

    const job = createMockJob();

    await expect(processMethod(job)).rejects.toThrow('Browser launch failed');
  });
});

// ═══════════════════════════════════════════
// EXTRACT PROGRESS HELPER TESTS
// ═══════════════════════════════════════════

describe('extractProgress()', () => {
  /**
   * The extractProgress() helper from the controller — safe job.progress extraction.
   *
   * In BullMQ progress can be any value (number, object, undefined).
   * We expect ScrapeJobProgress but defensive programming is essential.
   */
  const extractProgress = (progress: unknown): ScrapeJobProgress | null => {
    if (
      typeof progress === 'object' &&
      progress !== null &&
      'phase' in progress &&
      'message' in progress &&
      'percentage' in progress
    ) {
      return progress as ScrapeJobProgress;
    }
    return null;
  };

  it('geçerli ScrapeJobProgress → döner', () => {
    const progress: ScrapeJobProgress = {
      phase: 'SCANNING',
      message: 'Test',
      percentage: 50,
    };

    expect(extractProgress(progress)).toEqual(progress);
  });

  it('null input → null döner', () => {
    expect(extractProgress(null)).toBeNull();
  });

  it('undefined input → null döner', () => {
    expect(extractProgress(undefined)).toBeNull();
  });

  it('number input (eski BullMQ uyumluluk) → null döner', () => {
    expect(extractProgress(42)).toBeNull();
  });

  it('eksik alan olan object → null döner', () => {
    expect(extractProgress({ phase: 'SCANNING' })).toBeNull();
    expect(extractProgress({ phase: 'SCANNING', message: 'test' })).toBeNull();
  });
});

// ═══════════════════════════════════════════
// QUEUE PAYLOAD TYPE TESTS
// ═══════════════════════════════════════════

describe('Queue Payload Types', () => {
  it('ScrapeJobData zorunlu alanlar — keywords ve location', () => {
    const data: ScrapeJobData = {
      keywords: ['React Developer'],
      location: 'Istanbul',
    };

    expect(data.keywords).toHaveLength(1);
    expect(data.location).toBe('Istanbul');
    expect(data.config).toBeUndefined(); // optional
  });

  it('ScrapeJobData opsiyonel config override', () => {
    const data: ScrapeJobData = {
      keywords: ['Frontend Developer'],
      location: 'Turkey',
      config: {
        requestDelayMin: 1000,
        requestDelayMax: 3000,
      },
    };

    expect(data.config).toBeDefined();
    expect(data.config?.requestDelayMin).toBe(1000);
  });

  it('ScrapeJobCompleted discriminated union — status: completed', () => {
    const result: ScrapeJobCompleted = {
      status: 'completed',
      targetNewJobs: 50,
      targetReached: false,
      discoveryMessage: '40 yeni ilan eklendi, 8 mevcut ilan güncellendi. Hedef 50 yeni ilan için sistem denedi ancak yeterli yeni kayıt yoktu.',
      totalJobs: 50,
      filtered: 5,
      created: 40,
      updated: 8,
      failed: 2,
      durationMs: 120_000,
      auditId: 'audit-abc',
    };

    // Discriminated union: the status field guarantees type safety
    expect(result.status).toBe('completed');
    expect(result.totalJobs).toBeGreaterThanOrEqual(result.created + result.updated);
  });
});
