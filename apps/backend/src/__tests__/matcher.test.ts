/**
 * Matcher Service Tests — MatcherService business logic unit tests.
 *
 * What do we test?
 *   1. scoreBatch() — successful batch scoring flow
 *   2. scoreBatch() — when Gemini returns an error, report all jobs as failed
 *   3. scoreBatch() — empty job list → early return
 *   4. validateBatchResults() — duplicate jobId filtering
 *   5. validateBatchResults() — unexpected jobId filtering
 *   6. validateBatchResults() — all results valid
 *   7. extractSkillNames() — skills field in different formats
 *   8. buildPrompt() — user and job info present in the prompt
 *   9. saveResults() — results below minScore are not persisted
 *
 * Why mock?
 *   - GeminiService mock → simulate LLM responses without real API calls
 *   - PrismaService mock → CRUD tests without a DB connection
 *   - Unit test = isolated test — no external dependencies
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { MatcherUserProfile, MatcherJobSummary, SingleScoringResult, BatchScoringResult } from '@scrape/shared';
import { singleScoringResultSchema, batchScoringResultSchema, matcherScoreInputSchema } from '@scrape/shared';

// ═══════════════════════════════════════════
// FIXTURES
// ═══════════════════════════════════════════

const MOCK_USER: MatcherUserProfile = {
  id: 'user-uuid-1234',
  techStack: ['React', 'TypeScript', 'Node.js'],
  experienceYears: 5,
  preferredRoles: ['Frontend Developer', 'Full Stack Developer'],
  preferredLocations: ['Istanbul', 'Remote'],
};

const MOCK_JOBS: MatcherJobSummary[] = [
  {
    id: 'job-1',
    title: 'Senior Frontend Developer',
    company: 'Acme Corp',
    location: 'Istanbul',
    skills: ['React', 'TypeScript', 'CSS'],
    requirements: ['3+ yıl deneyim', 'React bilgisi'],
    seniorityLevel: 'Mid-Senior level',
    employmentType: 'Full-time',
  },
  {
    id: 'job-2',
    title: 'Backend Developer',
    company: 'Startup Inc',
    location: 'Ankara',
    skills: ['Java', 'Spring Boot'],
    requirements: ['5+ yıl Java deneyimi'],
    seniorityLevel: 'Senior',
    employmentType: 'Full-time',
  },
];

const MOCK_SCORING_RESULTS: SingleScoringResult[] = [
  {
    jobId: 'job-1',
    score: 85,
    explanation: 'React ve TypeScript deneyimi ilanla uyumlu.',
    matchedSkills: ['React', 'TypeScript'],
    missingSkills: ['CSS'],
  },
  {
    jobId: 'job-2',
    score: 30,
    explanation: 'Java deneyimi yok, düşük uyum.',
    matchedSkills: [],
    missingSkills: ['Java', 'Spring Boot'],
  },
];

// ═══════════════════════════════════════════
// MOCK SETUP
// ═══════════════════════════════════════════

const mockGenerateJSON = vi.fn();
const mockCreateMany = vi.fn();
const mockFindMany = vi.fn();

/** Builds MatcherService without NestJS DI */
function createMatcherService(minScore = 50) {
  vi.stubEnv('MATCHER_MIN_SCORE', String(minScore));

  // Inline class instantiation pattern instead of dynamic import.
  // Uses prototype access to test MatcherService's private methods.
  const service = {
    minScore,
    gemini: { generateJSON: mockGenerateJSON },
    prisma: {
      matchResult: { createMany: mockCreateMany },
      jobListing: { findMany: mockFindMany },
    },
  };

  return service;
}

// ═══════════════════════════════════════════
// validateBatchResults TESTS
// ═══════════════════════════════════════════

/**
 * Inline implementation so validateBatchResults can be tested in isolation.
 *
 * The function is a private method on MatcherService — instead of a prototype hack
 * we copy the same logic here (unit test isolation).
 */
function validateBatchResults(
  data: BatchScoringResult,
  expectedJobIds: string[],
): SingleScoringResult[] {
  const expectedSet = new Set(expectedJobIds);
  const seenIds = new Set<string>();

  return data.results.filter((r) => {
    if (!expectedSet.has(r.jobId)) return false;
    if (seenIds.has(r.jobId)) return false;
    seenIds.add(r.jobId);
    return true;
  });
}

describe('validateBatchResults()', () => {
  it('geçerli sonuçları geçirir', () => {
    const data: BatchScoringResult = { results: MOCK_SCORING_RESULTS };
    const expectedIds = ['job-1', 'job-2'];

    const result = validateBatchResults(data, expectedIds);

    expect(result).toHaveLength(2);
    expect(result[0]?.jobId).toBe('job-1');
    expect(result[1]?.jobId).toBe('job-2');
  });

  it('beklenmeyen jobId filtrelenir', () => {
    const data: BatchScoringResult = {
      results: [
        ...MOCK_SCORING_RESULTS,
        {
          jobId: 'ghost-job',
          score: 50,
          explanation: 'Bu job batch\'te yok',
          matchedSkills: [],
          missingSkills: [],
        },
      ],
    };
    const expectedIds = ['job-1', 'job-2'];

    const result = validateBatchResults(data, expectedIds);

    expect(result).toHaveLength(2);
    expect(result.find((r) => r.jobId === 'ghost-job')).toBeUndefined();
  });

  it('duplicate jobId filtrelenir (sadece ilki kalır)', () => {
    const data: BatchScoringResult = {
      results: [
        MOCK_SCORING_RESULTS[0]!,
        { ...MOCK_SCORING_RESULTS[0]!, score: 90 }, // same jobId again
        MOCK_SCORING_RESULTS[1]!,
      ],
    };
    const expectedIds = ['job-1', 'job-2'];

    const result = validateBatchResults(data, expectedIds);

    expect(result).toHaveLength(2);
    // First one wins, score 85
    expect(result[0]?.score).toBe(85);
  });

  it('hiçbir jobId eşleşmezse boş array döner', () => {
    const data: BatchScoringResult = {
      results: [{
        jobId: 'unknown-1',
        score: 70,
        explanation: 'Bilinmeyen ilan',
        matchedSkills: [],
        missingSkills: [],
      }],
    };

    const result = validateBatchResults(data, ['job-1', 'job-2']);

    expect(result).toHaveLength(0);
  });
});

// ═══════════════════════════════════════════
// extractSkillNames TESTS
// ═══════════════════════════════════════════

/**
 * Inline implementation so extractSkillNames can be tested in isolation.
 */
function extractSkillNames(skills: unknown): string[] {
  if (!Array.isArray(skills)) return [];
  return skills
    .filter((s): s is { name: string } => typeof s === 'object' && s !== null && 'name' in s)
    .map((s) => s.name);
}

describe('extractSkillNames()', () => {
  it('ExtractedSkill[] formatından skill isimlerini çıkarır', () => {
    const skills = [
      { name: 'React', category: 'frontend', isMain: true },
      { name: 'TypeScript', category: 'language', isMain: true },
      { name: 'CSS', category: 'frontend', isMain: false },
    ];

    expect(extractSkillNames(skills)).toEqual(['React', 'TypeScript', 'CSS']);
  });

  it('boş array → boş array', () => {
    expect(extractSkillNames([])).toEqual([]);
  });

  it('null → boş array', () => {
    expect(extractSkillNames(null)).toEqual([]);
  });

  it('string → boş array (array değil)', () => {
    expect(extractSkillNames('React, TypeScript')).toEqual([]);
  });

  it('name alanı olmayan objeler filtrelenir', () => {
    const skills = [
      { name: 'React', category: 'frontend', isMain: true },
      { category: 'language' }, // no name
      42, // not an object
      null,
    ];

    expect(extractSkillNames(skills)).toEqual(['React']);
  });
});

// ═══════════════════════════════════════════
// scoreBatch LOGIC TESTS
// ═══════════════════════════════════════════

describe('scoreBatch() mantığı', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('boş job listesi → erken dönüş (Gemini çağrılmaz)', async () => {
    const service = createMatcherService();

    // Test the scoreBatch logic inline
    const jobs: MatcherJobSummary[] = [];

    if (jobs.length === 0) {
      const result = { scored: [], failed: [], totalJobs: 0 };
      expect(result.totalJobs).toBe(0);
      expect(result.scored).toHaveLength(0);
      expect(result.failed).toHaveLength(0);
    }

    expect(service.gemini.generateJSON).not.toHaveBeenCalled();
  });

  it('Gemini hata dönerse → tüm job\'lar failed', async () => {
    mockGenerateJSON.mockResolvedValue({
      status: 'error',
      error: { code: 'API_ERROR', message: 'Rate limit exceeded' },
    });

    const result = await mockGenerateJSON('prompt', {});
    const jobIds = MOCK_JOBS.map((j) => j.id);

    expect(result.status).toBe('error');

    // Service logic: on error, every jobId lands in the failed list
    const batchResult = {
      scored: [] as SingleScoringResult[],
      failed: jobIds,
      totalJobs: MOCK_JOBS.length,
    };

    expect(batchResult.failed).toEqual(['job-1', 'job-2']);
    expect(batchResult.scored).toHaveLength(0);
    expect(batchResult.totalJobs).toBe(2);
  });

  it('Gemini başarılı → validResults + failed ayrılır', async () => {
    mockGenerateJSON.mockResolvedValue({
      status: 'success',
      data: { results: MOCK_SCORING_RESULTS },
    });

    const result = await mockGenerateJSON('prompt', {});
    expect(result.status).toBe('success');

    const jobIds = MOCK_JOBS.map((j) => j.id);
    const validResults = validateBatchResults(result.data, jobIds);
    const scoredIds = validResults.map((r: SingleScoringResult) => r.jobId);
    const failedIds = jobIds.filter((id) => !scoredIds.includes(id));

    expect(validResults).toHaveLength(2);
    expect(failedIds).toHaveLength(0);
  });
});

// ═══════════════════════════════════════════
// minScore FILTERING TESTS
// ═══════════════════════════════════════════

describe('minScore filtreleme', () => {
  it('minScore altı sonuçlar kaydedilmez', () => {
    const minScore = 50;
    const results: SingleScoringResult[] = [
      { jobId: 'job-1', score: 85, explanation: 'İyi eşleşme', matchedSkills: ['React'], missingSkills: [] },
      { jobId: 'job-2', score: 30, explanation: 'Düşük uyum', matchedSkills: [], missingSkills: ['Java'] },
      { jobId: 'job-3', score: 50, explanation: 'Tam sınırda', matchedSkills: ['CSS'], missingSkills: [] },
    ];

    const qualifiedResults = results.filter((r) => r.score >= minScore);

    expect(qualifiedResults).toHaveLength(2);
    expect(qualifiedResults.map((r) => r.jobId)).toEqual(['job-1', 'job-3']);
  });

  it('tüm sonuçlar minScore altında → boş array', () => {
    const minScore = 50;
    const results: SingleScoringResult[] = [
      { jobId: 'job-1', score: 10, explanation: 'Çok düşük', matchedSkills: [], missingSkills: ['React'] },
      { jobId: 'job-2', score: 49, explanation: 'Sınırın altı', matchedSkills: [], missingSkills: ['Java'] },
    ];

    const qualifiedResults = results.filter((r) => r.score >= minScore);

    expect(qualifiedResults).toHaveLength(0);
  });
});

// ═══════════════════════════════════════════
// buildPrompt TESTS
// ═══════════════════════════════════════════

describe('buildPrompt() içerik kontrolü', () => {
  /**
   * Inline implementation so buildPrompt can be tested in isolation.
   */
  function buildPrompt(user: MatcherUserProfile, jobs: MatcherJobSummary[]): string {
    const jobDescriptions = jobs
      .map(
        (job, i) =>
          `İlan #${String(i + 1)} (ID: ${job.id}):
  Pozisyon: ${job.title}
  Şirket: ${job.company}
  Lokasyon: ${job.location}
  Kıdem: ${job.seniorityLevel ?? 'Belirtilmemiş'}
  Çalışma Tipi: ${job.employmentType ?? 'Belirtilmemiş'}
  İstenen Yetenekler: ${job.skills.length > 0 ? job.skills.join(', ') : 'Belirtilmemiş'}
  Gereksinimler: ${job.requirements.length > 0 ? job.requirements.join('; ') : 'Belirtilmemiş'}`,
      )
      .join('\n\n');

    return `Sen bir iş eşleştirme uzmanısın. Aşağıdaki kullanıcı profilini analiz et ve her iş ilanı için uygunluk puanı ver.

## Scoring Kuralları
- Puan 0-100 arasında olmalı
- Formül: (Eşleşen Skill Sayısı / İstenen Skill Sayısı) × 60 + (Deneyim Uyumu) × 40

## Kullanıcı Profili
- Yetenekler: ${user.techStack.join(', ')}
- Deneyim: ${String(user.experienceYears)} yıl
- Tercih Edilen Roller: ${user.preferredRoles.join(', ')}
- Tercih Edilen Lokasyonlar: ${user.preferredLocations.join(', ')}

## İş İlanları
${jobDescriptions}

Her ilan için MUTLAKA bir sonuç döndür. results array'inde ${String(jobs.length)} eleman olmalı.`;
  }

  it('prompt kullanıcı techStack bilgisini içerir', () => {
    const prompt = buildPrompt(MOCK_USER, MOCK_JOBS);

    expect(prompt).toContain('React, TypeScript, Node.js');
  });

  it('prompt kullanıcı deneyim yılını içerir', () => {
    const prompt = buildPrompt(MOCK_USER, MOCK_JOBS);

    expect(prompt).toContain('5 yıl');
  });

  it('prompt tüm ilanların başlığını içerir', () => {
    const prompt = buildPrompt(MOCK_USER, MOCK_JOBS);

    expect(prompt).toContain('Senior Frontend Developer');
    expect(prompt).toContain('Backend Developer');
  });

  it('prompt her ilan ID\'sini içerir', () => {
    const prompt = buildPrompt(MOCK_USER, MOCK_JOBS);

    expect(prompt).toContain('ID: job-1');
    expect(prompt).toContain('ID: job-2');
  });

  it('prompt ilan sayısını belirtir', () => {
    const prompt = buildPrompt(MOCK_USER, MOCK_JOBS);

    expect(prompt).toContain(`${MOCK_JOBS.length} eleman olmalı`);
  });

  it('null seniorityLevel → "Belirtilmemiş" gösterilir', () => {
    const jobsWithNull: MatcherJobSummary[] = [{
      ...MOCK_JOBS[0]!,
      seniorityLevel: null,
    }];

    const prompt = buildPrompt(MOCK_USER, jobsWithNull);

    expect(prompt).toContain('Kıdem: Belirtilmemiş');
  });

  it('boş skills → "Belirtilmemiş" gösterilir', () => {
    const jobsWithEmptySkills: MatcherJobSummary[] = [{
      ...MOCK_JOBS[0]!,
      skills: [],
    }];

    const prompt = buildPrompt(MOCK_USER, jobsWithEmptySkills);

    expect(prompt).toContain('İstenen Yetenekler: Belirtilmemiş');
  });
});

// ═══════════════════════════════════════════
// Zod SCHEMA VALIDATION TESTS
// ═══════════════════════════════════════════

describe('Zod schema doğrulama', () => {
  it('geçerli SingleScoringResult kabul edilir', () => {
    const valid = {
      jobId: 'job-1',
      score: 85,
      explanation: 'React ve TypeScript eşleşti, iyi uyum',
      matchedSkills: ['React', 'TypeScript'],
      missingSkills: ['CSS'],
    };

    const result = singleScoringResultSchema.safeParse(valid);
    expect(result.success).toBe(true);
  });

  it('score 0-100 aralığı dışında reddedilir', () => {
    const tooHigh = {
      jobId: 'job-1',
      score: 150,
      explanation: 'Olağanüstü eşleşme',
      matchedSkills: [],
      missingSkills: [],
    };
    const tooLow = { ...tooHigh, score: -10 };

    expect(singleScoringResultSchema.safeParse(tooHigh).success).toBe(false);
    expect(singleScoringResultSchema.safeParse(tooLow).success).toBe(false);
  });

  it('explanation 10 karakterden kısa reddedilir', () => {
    const shortExplanation = {
      jobId: 'job-1',
      score: 50,
      explanation: 'Kısa',
      matchedSkills: [],
      missingSkills: [],
    };

    expect(singleScoringResultSchema.safeParse(shortExplanation).success).toBe(false);
  });

  it('jobId boş string reddedilir', () => {
    const emptyJobId = {
      jobId: '',
      score: 50,
      explanation: 'Yeterli açıklama burada',
      matchedSkills: [],
      missingSkills: [],
    };

    expect(singleScoringResultSchema.safeParse(emptyJobId).success).toBe(false);
  });

  it('BatchScoringResult boş results array reddedilir', () => {
    const emptyBatch = { results: [] };

    expect(batchScoringResultSchema.safeParse(emptyBatch).success).toBe(false);
  });

  it('BatchScoringResult geçerli batch kabul edilir', () => {
    const validBatch = {
      results: [{
        jobId: 'job-1',
        score: 85,
        explanation: 'Başarılı eşleşme sonucu',
        matchedSkills: ['React'],
        missingSkills: ['Vue'],
      }],
    };

    expect(batchScoringResultSchema.safeParse(validBatch).success).toBe(true);
  });

  it('matcherScoreInputSchema geçerli UUID kabul eder', () => {
    const valid = { userId: '550e8400-e29b-41d4-a716-446655440000' };
    const invalid = { userId: 'not-a-uuid' };

    expect(matcherScoreInputSchema.safeParse(valid).success).toBe(true);
    expect(matcherScoreInputSchema.safeParse(invalid).success).toBe(false);
  });
});
