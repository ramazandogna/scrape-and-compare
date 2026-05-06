/**
 * Zod Schemas — LLM çıktılarını ve dış veri kaynaklarını doğrulama.
 *
 * Neden Zod? GPT-4o JSON döner ama format garantisi yoktur.
 * Zod ile "bu JSON kesinlikle bu shape'te" diyoruz, değilse hata fırlatıyoruz.
 * Runtime'da type safety = Zod. Compile-time'da = TypeScript.
 *
 * copilot-instructions kuralı: "Validate all LLM outputs with Zod schemas"
 */

import { z } from 'zod';

/**
 * ExtractedSkill Zod şeması — LLM'den gelen skill verisi doğrulama
 */
export const extractedSkillSchema = z.object({
  name: z.string().min(1),
  category: z.string().min(1),
  isMain: z.boolean(),
});

/**
 * SalaryParsed Zod şeması — maaş verisi doğrulama
 */
export const salaryParsedSchema = z.object({
  min: z.number().nullable(),
  max: z.number().nullable(),
  currency: z.enum(['TRY', 'USD', 'EUR']),
  period: z.enum(['monthly', 'yearly']),
  raw: z.string(),
});

/**
 * JobListing Zod şeması — scraper çıktısı doğrulama
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
 * LLM'den gelen skill extraction yanıtı — Module B için
 */
export const llmSkillExtractionSchema = z.object({
  skills: z.array(z.string()),
  experienceYears: z.number().int().min(0),
  techStack: z.array(z.string()),
  preferredRoles: z.array(z.string()),
});

/** Zod'dan TypeScript tipi üretme — schema ile tip her zaman senkron */
export type LlmSkillExtraction = z.infer<typeof llmSkillExtractionSchema>;

// ═══════════════════════════════════════════
// API INPUT SCHEMAS
// ═══════════════════════════════════════════

/**
 * ScraperConfig Zod şeması — opsiyonel config override'ları doğrulama.
 * Tüm alanlar optional çünkü Partial<ScraperConfig> bekleniyor.
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
 * ScrapeJobData Zod şeması — POST /scrape/trigger body doğrulama.
 *
 * Kurallar:
 *   - keywords: en az 1 string, her biri 1-100 karakter, max 10 keyword
 *   - location: 1-100 karakter
 *   - config: opsiyonel scraper ayarları
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
 * GET /api/jobs query parametreleri — pagination, filtreleme, sıralama.
 *
 * Query string'ler her zaman string olarak gelir, bu yüzden:
 *   - z.coerce.number() → "2" string'ini 2 number'ına çevirir
 *   - .default() → parametre gönderilmezse varsayılan değer kullanılır
 *   - .max(100) → DoS koruması — tek seferde 100'den fazla kayıt dönemez
 *
 * Kullanım: GET /api/jobs?page=2&limit=15&search=React&location=Istanbul&sort=newest
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
 * Tek bir ilanın puanlama sonucu — Gemini'den dönen her ilan için.
 *
 * jobId: Hangi ilanın puanlandığını bilmek için (batch'te 8 ilan var, hangisi hangisi?)
 * score: 0-100 arası match yüzdesi
 * explanation: AI'ın "neden bu puanı verdim" açıklaması
 * matchedSkills: Kullanıcıda olan VE ilanda istenen skill'ler
 * missingSkills: İlanda istenen ama kullanıcıda olmayan skill'ler
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
 * Batch puanlama sonucu — Gemini'den dönen tüm yanıt.
 *
 * Neden array wrapper? Gemini'ye "8 ilan gönder, 8 sonuç al" diyoruz.
 * results array'i her ilanın ayrı puanını taşır.
 * Zod burada array uzunluğunu kontrol etmez — çünkü son batch 8'den az olabilir.
 * Eksik/fazla ilan kontrolü MatcherService'de yapılır (4.3).
 */
export const batchScoringResultSchema = z.object({
  results: z.array(singleScoringResultSchema).min(1),
});

export type BatchScoringResult = z.infer<typeof batchScoringResultSchema>;

/**
 * POST /api/matcher/score body — hangi kullanıcı için puanlama yapılacak.
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
 * POST /api/users body — yeni kullanıcı oluşturma.
 *
 * Kurallar:
 *   - email: geçerli email formatı (unique DB constraint)
 *   - name: 1-100 karakter
 *   - techStack: string array, her biri 1-50 karakter (max 50 skill)
 *   - experienceYears: 0-50 arası tam sayı
 *   - preferredRoles: string array (max 10 rol)
 *   - preferredLocations: string array (max 10 lokasyon)
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
 * PATCH /api/users/:id body — kullanıcı güncelleme.
 *
 * .partial() → tüm alanları optional yapar.
 * Frontend sadece değişen alanları gönderir, geri kalanı dokunulmaz.
 * Boş body ({}) da geçerli — hiçbir şey güncellenmez.
 */
export const updateUserSchema = createUserSchema.partial();

export type UpdateUserInput = z.infer<typeof updateUserSchema>;
