/**
 * Matcher Processor Tests — BullMQ Worker unit tests.
 *
 * What do we test?
 *   1. Successful batch → returns MatcherJobCompleted
 *   2. If scoreBatch throws → process also throws (BullMQ marks it FAILED)
 *   3. Progress reporting → SCORING and SAVING phases are reported correctly
 *   4. Result shape — scored, failed, avgScore fields are correct
 *
 * Pattern: same approach as queue.test.ts (ScraperProcessor).
 * We test the Processor logic inline, without NestJS DI + Redis.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import type {
  MatcherJobData,
  MatcherJobResult,
  MatcherJobProgress,
  MatcherUserProfile,
  MatcherJobSummary,
  SingleScoringResult,
} from '@scrape/shared';

// ═══════════════════════════════════════════
// FIXTURES
// ═══════════════════════════════════════════

const MOCK_USER: MatcherUserProfile = {
  id: 'user-uuid-test',
  techStack: ['React', 'TypeScript'],
  experienceYears: 4,
  preferredRoles: ['Frontend Developer'],
  preferredLocations: ['Istanbul'],
};

const MOCK_JOBS: MatcherJobSummary[] = [
  {
    id: 'job-1',
    title: 'Frontend Developer',
    company: 'Corp A',
    location: 'Istanbul',
    skills: ['React', 'TypeScript'],
    requirements: ['2+ yıl'],
    seniorityLevel: 'Mid-Senior level',
    employmentType: 'Full-time',
  },
  {
    id: 'job-2',
    title: 'Backend Developer',
    company: 'Corp B',
    location: 'Ankara',
    skills: ['Java'],
    requirements: ['5+ yıl'],
    seniorityLevel: 'Senior',
    employmentType: 'Full-time',
  },
];

const MOCK_BATCH_RESULT = {
  scored: [
    {
      jobId: 'job-1',
      score: 82,
      explanation: 'React ve TypeScript eşleşti',
      matchedSkills: ['React', 'TypeScript'],
      missingSkills: [],
    },
    {
      jobId: 'job-2',
      score: 25,
      explanation: 'Java deneyimi yok',
      matchedSkills: [],
      missingSkills: ['Java'],
    },
  ] satisfies SingleScoringResult[],
  failed: [] as string[],
  totalJobs: 2,
};

// ═══════════════════════════════════════════
// MOCK SETUP
// ═══════════════════════════════════════════

const mockScoreBatch = vi.fn();

/** Mock Job object — BullMQ Job<MatcherJobData, MatcherJobResult> */
const createMockJob = (overrides?: Partial<{ data: MatcherJobData; id: string }>) => ({
  id: overrides?.id ?? 'matcher-job-1',
  data: overrides?.data ?? {
    user: MOCK_USER,
    jobs: MOCK_JOBS,
    batchIndex: 0,
    totalBatches: 1,
  },
  updateProgress: vi.fn(),
  attemptsMade: 0,
  name: 'score-batch',
});

/**
 * Inline implementation of the Processor's process() logic.
 *
 * The @Processor decorator requires NestJS DI, which we don't want in a unit test.
 * We test only the business logic.
 */
async function processMethod(
  job: ReturnType<typeof createMockJob>,
): Promise<MatcherJobResult> {
  const { user, jobs, batchIndex, totalBatches } = job.data;

  await job.updateProgress({
    phase: 'SCORING',
    message: `Batch ${String(batchIndex + 1)}/${String(totalBatches)}: ${String(jobs.length)} ilan puanlanıyor`,
    batchIndex,
    totalBatches,
    percentage: Math.round(((batchIndex) / totalBatches) * 100),
  } satisfies MatcherJobProgress);

  const result = await mockScoreBatch(user, jobs);

  await job.updateProgress({
    phase: 'SAVING',
    message: `Batch ${String(batchIndex + 1)}/${String(totalBatches)}: ${String(result.scored.length)} sonuç kaydedildi`,
    batchIndex,
    totalBatches,
    percentage: Math.round(((batchIndex + 1) / totalBatches) * 100),
  } satisfies MatcherJobProgress);

  const avgScore = result.scored.length > 0
    ? Math.round(result.scored.reduce((sum: number, s: SingleScoringResult) => sum + s.score, 0) / result.scored.length)
    : 0;

  return {
    status: 'completed',
    scored: result.scored.length,
    failed: result.failed.length,
    totalJobs: result.totalJobs,
    avgScore,
    batchIndex,
  };
}

// ═══════════════════════════════════════════
// TESTS
// ═══════════════════════════════════════════

describe('MatcherProcessor.process()', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockScoreBatch.mockResolvedValue(MOCK_BATCH_RESULT);
  });

  it('başarılı batch → MatcherJobCompleted döner', async () => {
    const job = createMockJob();

    const result = await processMethod(job);

    expect(result.status).toBe('completed');
    expect(result).toHaveProperty('scored', 2);
    expect(result).toHaveProperty('failed', 0);
    expect(result).toHaveProperty('totalJobs', 2);
    expect(result).toHaveProperty('batchIndex', 0);
  });

  it('avgScore doğru hesaplanır', async () => {
    const job = createMockJob();

    const result = await processMethod(job);

    // (82 + 25) / 2 = 53.5 → round → 54
    expect(result).toHaveProperty('avgScore', 54);
  });

  it('scoreBatch user ve jobs ile çağrılır', async () => {
    const job = createMockJob();

    await processMethod(job);

    expect(mockScoreBatch).toHaveBeenCalledWith(MOCK_USER, MOCK_JOBS);
    expect(mockScoreBatch).toHaveBeenCalledTimes(1);
  });

  it('progress SCORING → SAVING sırasıyla raporlanır', async () => {
    const job = createMockJob();

    await processMethod(job);

    expect(job.updateProgress).toHaveBeenCalledTimes(2);

    // First call: SCORING
    const firstProgress = job.updateProgress.mock.calls[0]?.[0] as MatcherJobProgress;
    expect(firstProgress.phase).toBe('SCORING');
    expect(firstProgress.batchIndex).toBe(0);

    // Last call: SAVING
    const lastProgress = job.updateProgress.mock.calls[1]?.[0] as MatcherJobProgress;
    expect(lastProgress.phase).toBe('SAVING');
    expect(lastProgress.percentage).toBe(100);
  });

  it('progress batch bilgisini içerir (multi-batch)', async () => {
    const job = createMockJob({
      data: {
        user: MOCK_USER,
        jobs: MOCK_JOBS,
        batchIndex: 2,
        totalBatches: 4,
      },
    });

    await processMethod(job);

    const firstProgress = job.updateProgress.mock.calls[0]?.[0] as MatcherJobProgress;
    expect(firstProgress.batchIndex).toBe(2);
    expect(firstProgress.totalBatches).toBe(4);
    // 2/4 = 50%
    expect(firstProgress.percentage).toBe(50);

    const lastProgress = job.updateProgress.mock.calls[1]?.[0] as MatcherJobProgress;
    // (2+1)/4 = 75%
    expect(lastProgress.percentage).toBe(75);
  });

  it('scoreBatch hata fırlatırsa → process de fırlatır (BullMQ FAILED yapar)', async () => {
    mockScoreBatch.mockRejectedValue(new Error('Gemini API rate limit'));

    const job = createMockJob();

    await expect(processMethod(job)).rejects.toThrow('Gemini API rate limit');
  });

  it('boş scored listesi → avgScore 0', async () => {
    mockScoreBatch.mockResolvedValue({
      scored: [],
      failed: ['job-1', 'job-2'],
      totalJobs: 2,
    });

    const job = createMockJob();
    const result = await processMethod(job);

    expect(result).toHaveProperty('avgScore', 0);
    expect(result).toHaveProperty('scored', 0);
    expect(result).toHaveProperty('failed', 2);
  });
});
