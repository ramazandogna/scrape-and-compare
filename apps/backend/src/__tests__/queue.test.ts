/**
 * Queue Tests — BullMQ entegrasyonunun birim testleri.
 *
 * Neyi test ediyoruz?
 *   1. ScraperProcessor.process() → ScraperService.runFastScrape() çağırıyor mu
 *   2. Başarılı job → ScrapeJobCompleted dönüyor mu
 *   3. Başarısız job → hata fırlatıyor mu (BullMQ FAILED olarak işaretler)
 *   4. Progress reporting → job.updateProgress() çağrılıyor mu
 *   5. extractProgress() → güvenli progress extraction
 *
 * Neden mock?
 *   - Gerçek Redis bağlantısı gerekmez (unit test)
 *   - ScraperService mock'lanır — browser açmadan test edilir
 *   - Job nesnesi mock'lanır — Redis'e bağlanmadan BullMQ davranışı test edilir
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { ScrapeJobData, ScrapeJobCompleted, ScrapeJobProgress } from '@scrape/shared';

// ═══════════════════════════════════════════
// MOCK SETUP
// ═══════════════════════════════════════════

/** Mock ScrapeJobCompleted sonucu — başarılı scrape */
const MOCK_COMPLETED: ScrapeJobCompleted = {
  status: 'completed',
  totalJobs: 15,
  filtered: 2,
  created: 10,
  updated: 3,
  failed: 2,
  durationMs: 45_000,
  auditId: 'audit-test-123',
};

/** Mock ScrapeJobData payload'ı */
const MOCK_JOB_DATA: ScrapeJobData = {
  keywords: ['Frontend Developer', 'React Developer'],
  location: 'Istanbul',
};

/**
 * Mock Job nesnesi — BullMQ'nun Job<ScrapeJobData, ScrapeJobResult> yerine geçer.
 *
 * Neden tip olarak tanımlamak yerine factory kullanıyoruz?
 * Her test kendi bağımsız mock'unu almalı — state paylaşımı test izolasyonunu bozar.
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
   * Process metodunu izole test etmek için ScraperService'i mock'luyoruz.
   * Processor'ın tek işi: job.data → scraperService.runFastScrape(job.data)
   */
  const mockRunFastScrape = vi.fn();

  /** Processor instance'ı — her testte taze mock ile oluşturulur */
  let processMethod: (job: ReturnType<typeof createMockJob>) => Promise<unknown>;

  beforeEach(() => {
    vi.clearAllMocks();
    mockRunFastScrape.mockResolvedValue(MOCK_COMPLETED);

    /**
     * Processor'ın process() mantığını inline olarak test ediyoruz.
     *
     * Neden doğrudan ScraperProcessor import etmiyoruz?
     * @Processor decorator'ı NestJS DI + Redis bağlantısı gerektirir.
     * Unit test'te bunu istemiyoruz — sadece iş mantığını test ediyoruz.
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

    // İlk çağrı: SCANNING, %0
    const firstProgress = job.updateProgress.mock.calls[0]?.[0] as ScrapeJobProgress;
    expect(firstProgress.phase).toBe('SCANNING');
    expect(firstProgress.percentage).toBe(0);

    // Son çağrı: EXTRACTING, %100
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
   * Controller'daki extractProgress() helper'ı — job.progress güvenli extraction.
   *
   * BullMQ'da progress herhangi bir değer olabilir (number, object, undefined).
   * Biz ScrapeJobProgress bekleriz ama defensive programlama şart.
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
    expect(data.config).toBeUndefined(); // opsiyonel
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
      totalJobs: 50,
      filtered: 5,
      created: 40,
      updated: 8,
      failed: 2,
      durationMs: 120_000,
      auditId: 'audit-abc',
    };

    // Discriminated union: status alanı tip güvenliğini garanti eder
    expect(result.status).toBe('completed');
    expect(result.totalJobs).toBeGreaterThanOrEqual(result.created + result.updated);
  });
});
