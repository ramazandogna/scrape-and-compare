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
  location: z.string(),
  salary: z.string().nullable(),
  salaryParsed: salaryParsedSchema.nullable(),
  description: z.string().nullable(),
  requirements: z.array(z.string()),
  skills: z.array(extractedSkillSchema),
  seniorityLevel: z.string().nullable(),
  employmentType: z.string().nullable(),
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
