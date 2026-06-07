/**
 * Zod Schemas — validation for LLM outputs and external data sources.
 *
 * Why Zod? GPT-4o returns JSON but offers no format guarantee.
 * Zod asserts "this JSON is exactly this shape" and throws otherwise.
 * Runtime type safety = Zod. Compile-time = TypeScript.
 *
 * copilot-instructions rule: "Validate all LLM outputs with Zod schemas"
 */

import { z } from 'zod';

/**
 * ExtractedSkill Zod schema — validates skill data from the LLM
 */
export const extractedSkillSchema = z.object({
  name: z.string().min(1),
  category: z.string().min(1),
  isMain: z.boolean(),
});

/**
 * SalaryParsed Zod schema — validates salary data
 */
export const salaryParsedSchema = z.object({
  min: z.number().nullable(),
  max: z.number().nullable(),
  currency: z.enum(['TRY', 'USD', 'EUR']),
  period: z.enum(['monthly', 'yearly']),
  raw: z.string(),
});

/**
 * JobListing Zod schema — validates scraper output
 */
export const jobListingSchema = z.object({
  id: z.string().min(1),
  title: z.string().min(1),
  company: z.string().min(1),
  logoUrl: z.string().url().nullable(),
  location: z.string(),
  salary: z.string().nullable(),
  salaryParsed: salaryParsedSchema.nullable(),
  description: z.string().nullable(),
  requirements: z.array(z.string()),
  skills: z.array(extractedSkillSchema),
  seniorityLevel: z.string().nullable(),
  employmentType: z.string().nullable(),
  workType: z.string().nullable(),
  link: z.string().url(),
  postedDate: z.string().nullable(),
  scrapedAt: z.string(),
});

/**
 * Skill extraction response from the LLM — for Module B
 */
export const llmSkillExtractionSchema = z.object({
  skills: z.array(z.string()),
  experienceYears: z.number().int().min(0),
  techStack: z.array(z.string()),
  preferredRoles: z.array(z.string()),
});

/** Derive TypeScript type from Zod — schema and type always stay in sync */
export type LlmSkillExtraction = z.infer<typeof llmSkillExtractionSchema>;

// ═══════════════════════════════════════════
// API INPUT SCHEMAS
// ═══════════════════════════════════════════

/**
 * ScraperConfig Zod schema — validates optional config overrides.
 * All fields are optional since a Partial<ScraperConfig> is expected.
 */
export const scraperConfigSchema = z.object({
  headless: z.boolean(),
  slowMo: z.number().int().min(0),
  maxJobsPerKeyword: z.number().int().min(1).max(200),
  maxSearchPages: z.number().int().min(1).max(20),
  requestDelayMin: z.number().int().min(0),
  requestDelayMax: z.number().int().min(0),
  fetchDetails: z.boolean(),
  maxDetailFetch: z.number().int().min(1).max(200),
  targetNewJobs: z.number().int().min(1).max(200),
}).partial();

/**
 * ScrapeJobData Zod schema — validates POST /scrape/trigger body.
 *
 * Rules:
 *   - keywords: at least 1 string, each 1-100 chars, max 10 keywords
 *   - location: 1-100 chars
 *   - config: optional scraper settings
 */
export const scrapeJobDataSchema = z.object({
  keywords: z
    .array(z.string().trim().min(1, 'Keyword boş olamaz').max(100))
    .min(1, 'En az 1 keyword gerekli')
    .max(10, 'En fazla 10 keyword destekleniyor'),
  location: z
    .string()
    .trim()
    .min(1, 'Location boş olamaz')
    .max(100),
  userId: z.string().uuid('Geçerli bir userId olmalı').optional(),
  config: scraperConfigSchema.optional(),
});

export type ScrapeJobDataInput = z.infer<typeof scrapeJobDataSchema>;

// ═══════════════════════════════════════════
// JOBS QUERY SCHEMA
// ═══════════════════════════════════════════

/**
 * GET /api/jobs query parameters — pagination, filtering, sorting.
 *
 * Query strings always arrive as strings, so:
 *   - z.coerce.number() → converts "2" string to the number 2
 *   - .default() → applies a default when the parameter is omitted
 *   - .max(100) → DoS protection — cannot return more than 100 records at once
 *
 * Usage: GET /api/jobs?page=2&limit=15&search=React&location=Istanbul&sort=newest
 */
export const jobsQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(500).default(20),
  userId: z.string().uuid('Geçerli bir userId olmalı').optional(),
  search: z.string().trim().max(200).optional(),
  location: z.string().trim().max(100).optional(),
  sort: z.enum(['newest', 'oldest']).default('newest'),
});

export type JobsQueryInput = z.infer<typeof jobsQuerySchema>;

// ═══════════════════════════════════════════
// MATCHER SCORING SCHEMAS
// ═══════════════════════════════════════════

/**
 * Per-listing scoring result — for each listing returned by Gemini.
 *
 * jobId: identifies which listing was scored (8 listings in a batch — which is which?)
 * score: match percentage from 0-100
 * explanation: the AI's "why I gave this score" rationale
 * matchedSkills: skills the user has AND the listing asks for
 * missingSkills: skills the listing asks for but the user lacks
 */
export const singleScoringResultSchema = z.object({
  jobId: z.string().min(1),
  score: z.number().min(0).max(100),
  explanation: z.string().min(10),
  matchedSkills: z.array(z.string()),
  missingSkills: z.array(z.string()),
});

export type SingleScoringResult = z.infer<typeof singleScoringResultSchema>;

/**
 * Batch scoring result — the full response from Gemini.
 *
 * Why an array wrapper? We tell Gemini "send 8 listings, return 8 results".
 * The results array carries the per-listing score.
 * Zod does not enforce array length here — the last batch may have fewer than 8.
 * Missing/extra listing checks happen in MatcherService (4.3).
 */
export const batchScoringResultSchema = z.object({
  results: z.array(singleScoringResultSchema).min(1),
});

export type BatchScoringResult = z.infer<typeof batchScoringResultSchema>;

/**
 * POST /api/matcher/score body — which user to run scoring for.
 */
const matcherScoreBaseSchema = z.object({
  userId: z.string().uuid('Geçerli bir UUID olmalı'),
});

const matcherScoreAllSchema = matcherScoreBaseSchema.extend({
  scope: z.literal('all'),
});

const matcherScoreUnscoredSchema = matcherScoreBaseSchema.extend({
  scope: z.literal('unscored'),
});

const matcherScoreSelectedSchema = matcherScoreBaseSchema.extend({
  scope: z.literal('selected'),
  jobIds: z.array(z.string().uuid('Geçerli bir jobId olmalı')).min(1),
});

export const matcherScoreInputSchema = z.discriminatedUnion('scope', [
  matcherScoreAllSchema,
  matcherScoreUnscoredSchema,
  matcherScoreSelectedSchema,
]);

export type MatcherScoreInput = z.infer<typeof matcherScoreInputSchema>;

// ═══════════════════════════════════════════
// USER SCHEMAS
// ═══════════════════════════════════════════

/**
 * POST /api/users body — create a new user.
 *
 * Rules:
 *   - email: valid email format (unique DB constraint)
 *   - name: 1-100 chars
 *   - techStack: string array, each 1-50 chars (max 50 skills)
 *   - experienceYears: integer between 0-50
 *   - preferredRoles: string array (max 10 roles)
 *   - preferredLocations: string array (max 10 locations)
 */
export const createUserSchema = z.object({
  email: z.string().trim().email('Geçerli bir email adresi giriniz'),
  name: z.string().trim().min(1, 'İsim boş olamaz').max(100),
  techStack: z
    .array(z.string().trim().min(1).max(50))
    .max(50, 'En fazla 50 teknoloji eklenebilir')
    .default([]),
  experienceYears: z.coerce.number().int().min(0).max(50).default(0),
  preferredRoles: z
    .array(z.string().trim().min(1).max(100))
    .max(10, 'En fazla 10 rol tercihi')
    .default([]),
  preferredLocations: z
    .array(z.string().trim().min(1).max(100))
    .max(10, 'En fazla 10 lokasyon tercihi')
    .default([]),
});

export type CreateUserInput = z.infer<typeof createUserSchema>;

/**
 * PATCH /api/users/:id body — update a user.
 *
 * .partial() → makes all fields optional.
 * Frontend only sends changed fields; the rest stay untouched.
 * An empty body ({}) is also valid — nothing gets updated.
 */
export const updateUserSchema = createUserSchema.partial();

export type UpdateUserInput = z.infer<typeof updateUserSchema>;

// ═══════════════════════════════════════════
// AUTH SCHEMAS
// ═══════════════════════════════════════════

const passwordSchema = z
  .string()
  .min(8, 'Şifre en az 8 karakter olmalı')
  .max(72, 'Şifre çok uzun (max 72 karakter)');

export const signupSchema = z.object({
  email: z.string().trim().email('Geçerli bir email adresi giriniz'),
  name: z.string().trim().min(1, 'İsim boş olamaz').max(100),
  password: passwordSchema,
});
export type SignupInput = z.infer<typeof signupSchema>;

export const loginSchema = z.object({
  email: z.string().trim().email('Geçerli bir email adresi giriniz'),
  password: z.string().min(1, 'Şifre gerekli'),
});
export type LoginInput = z.infer<typeof loginSchema>;

export const forgotPasswordSchema = z.object({
  email: z.string().trim().email('Geçerli bir email adresi giriniz'),
});
export type ForgotPasswordInput = z.infer<typeof forgotPasswordSchema>;

export const resetPasswordSchema = z.object({
  token: z.string().min(10, 'Geçersiz token'),
  password: passwordSchema,
});
export type ResetPasswordInput = z.infer<typeof resetPasswordSchema>;
