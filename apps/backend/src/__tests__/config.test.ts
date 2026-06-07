/**
 * Config Tests — environment variable loading and adaptive delay tests.
 *
 * What do we test?
 *   1. Default values: when env is missing safe defaults apply
 *   2. Env overrides: KEYWORDS, LOCATION, PARALLEL_TABS, etc.
 *   3. Adaptive delay: with 3+ keywords the delay scales 1.5x
 *   4. Output filename format: job-YYYY-MM-DD-HH-MM.json
 *   5. Deduplication: the same ID/link never appears twice
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  loadKeywords,
  loadLocation,
  loadFastConfig,
  generateOutputFilename,
  deduplicateJobs,
} from '@/modules/scraper/helpers/config';
import { FULL_JOB, MINIMAL_JOB, USD_YEARLY_JOB } from './fixtures';

// ═══════════════════════════════════════════
// ENV MOCK HELPER
// ═══════════════════════════════════════════

const originalEnv = { ...process.env };

beforeEach(() => {
  // Reset env before each test
  vi.unstubAllEnvs();
});

afterEach(() => {
  process.env = { ...originalEnv };
});

// ═══════════════════════════════════════════
// KEYWORD LOADING
// ═══════════════════════════════════════════

describe('loadKeywords', () => {
  it('KEYWORDS tanımlı → virgülle ayrılmış liste döner', () => {
    vi.stubEnv('KEYWORDS', 'React Developer, Vue Developer, Angular');
    const keywords = loadKeywords();

    expect(keywords).toEqual(['React Developer', 'Vue Developer', 'Angular']);
  });

  it('KEYWORDS boş → default keyword listesi döner', () => {
    vi.stubEnv('KEYWORDS', '');
    const keywords = loadKeywords();

    expect(keywords).toEqual(['Frontend Developer', 'React Developer']);
  });

  it('KEYWORDS tanımlı değil → default keyword listesi döner', () => {
    delete process.env['KEYWORDS'];
    const keywords = loadKeywords();

    expect(keywords).toEqual(['Frontend Developer', 'React Developer']);
  });
});

// ═══════════════════════════════════════════
// LOCATION LOADING
// ═══════════════════════════════════════════

describe('loadLocation', () => {
  it('LOCATION tanımlı → döner', () => {
    vi.stubEnv('LOCATION', 'Istanbul');
    expect(loadLocation()).toBe('Istanbul');
  });

  it('LOCATION boş → default Turkey döner', () => {
    vi.stubEnv('LOCATION', '');
    expect(loadLocation()).toBe('Turkey');
  });
});

// ═══════════════════════════════════════════
// FAST CONFIG
// ═══════════════════════════════════════════

describe('loadFastConfig', () => {
  it('1-2 keyword → normal delay (1x)', () => {
    vi.stubEnv('REQUEST_DELAY_MIN', '500');
    vi.stubEnv('REQUEST_DELAY_MAX', '1500');

    const config = loadFastConfig(2);
    expect(config.requestDelayMin).toBe(500);
    expect(config.requestDelayMax).toBe(1500);
  });

  it('3+ keyword → adaptive delay (1.5x)', () => {
    vi.stubEnv('REQUEST_DELAY_MIN', '500');
    vi.stubEnv('REQUEST_DELAY_MAX', '1500');

    const config = loadFastConfig(4);
    expect(config.requestDelayMin).toBe(750);  // 500 × 1.5
    expect(config.requestDelayMax).toBe(2250); // 1500 × 1.5
  });

  it('default config değerleri doğru', () => {
    // Clear every env variable
    delete process.env['REQUEST_DELAY_MIN'];
    delete process.env['REQUEST_DELAY_MAX'];
    delete process.env['HEADLESS'];
    delete process.env['PARALLEL_TABS'];
    delete process.env['SEARCH_CONCURRENCY'];

    const config = loadFastConfig(1);
    expect(config.headless).toBe(true);
    expect(config.parallelTabs).toBe(5);
    expect(config.searchConcurrency).toBe(2);
  });
});

// ═══════════════════════════════════════════
// OUTPUT FILENAME
// ═══════════════════════════════════════════

describe('generateOutputFilename', () => {
  it('job-YYYY-MM-DD-HH-MM.json formatında döner', () => {
    const filename = generateOutputFilename();

    // Verify format with regex
    expect(filename).toMatch(/^job-\d{4}-\d{2}-\d{2}-\d{2}-\d{2}\.json$/);
  });
});

// ═══════════════════════════════════════════
// DEDUPLICATION
// ═══════════════════════════════════════════

describe('deduplicateJobs', () => {
  it('aynı ID tekrarlanırsa filtreler', () => {
    const jobs = [FULL_JOB, { ...FULL_JOB }]; // same id
    const seenIds = new Set<string>();
    const seenLinks = new Set<string>();

    const result = deduplicateJobs(jobs, 25, seenIds, seenLinks);
    expect(result).toHaveLength(1);
  });

  it('farklı ID + aynı link → filtreler', () => {
    const jobs = [
      FULL_JOB,
      { ...MINIMAL_JOB, link: FULL_JOB.link }, // different ID but same link
    ];
    const seenIds = new Set<string>();
    const seenLinks = new Set<string>();

    const result = deduplicateJobs(jobs, 25, seenIds, seenLinks);
    expect(result).toHaveLength(1);
  });

  it('maxPerKeyword limitini uygular', () => {
    const jobs = [FULL_JOB, MINIMAL_JOB, USD_YEARLY_JOB];
    const seenIds = new Set<string>();
    const seenLinks = new Set<string>();

    const result = deduplicateJobs(jobs, 2, seenIds, seenLinks);
    expect(result).toHaveLength(2);
  });

  it('unknown_ ID duplicate check atlar', () => {
    const unknown1 = { ...FULL_JOB, id: 'unknown_1', link: 'link1' };
    const unknown2 = { ...FULL_JOB, id: 'unknown_1', link: 'link2' }; // same unknown ID but different link
    const seenIds = new Set<string>();
    const seenLinks = new Set<string>();

    const result = deduplicateJobs([unknown1, unknown2], 25, seenIds, seenLinks);
    // IDs with the unknown_ prefix are exempt from the duplicate check
    expect(result).toHaveLength(2);
  });
});
