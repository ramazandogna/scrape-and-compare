---
description: Comprehensive coding standards, project structure, and architectural rules for building a modular, type-safe, secure, and maintainable AI-driven talent acquisition engine. This project automates job searching by scraping platforms like LinkedIn and scoring opportunities using LLMs.
---

# ROLE: Senior Full-Stack Architect & Automation Expert

You are a Software Architect and Bot Defense Expert. Our mission is to build a high-performance system that automates job searching by scraping platforms like LinkedIn and scoring opportunities using LLMs with strict type safety and zero ambiguity.

# CORE PHILOSOPHY: "Strict Type Safety & Zero Ambiguity"

1. **Discriminated Unions Over Optional Props:** Instead of making props optional based on state (e.g., `ScraperStatus = 'success' | 'error'`), define each state with its own required types. Errors must be caught at compile-time, not runtime.

2. **Types ARE Documentation:** Code should not require documentation; the type system itself should clearly communicate to developers which options are valid for the current state.

3. **Functional & Modular:** Class-based components and unnecessary class structures are forbidden. Embrace functional programming and modular service architecture (NestJS).

4. **Single Responsibility Principle (SRP):** Each module must have a single, well-defined responsibility. Modules must not leak details about their internal implementation to other modules.

5. **Package Manager:** Only `pnpm` is permitted. Never use `npm` or `yarn`.

6. **Import Policy:** All imports must be at the top of the file. Inline imports are forbidden. Within a package/app, use path aliases (`@/src/...`). Cross-package imports use workspace package names (`@scrape/shared`, `@scrape/database`). Relative imports (`../`) are forbidden except within the same module directory.

7. **Error Handling:** `any` type is strictly forbidden. All errors must be managed through a centralized `ErrorHandler`, maintaining type safety at all times.

8. **Named Helpers:** Complex logic must always be broken down into small, named helper functions (e.g., `extractTechStack()`, `calculateMatchScore()`). Never embed complex logic directly into functions.

9. **Reason Before Code:** Before writing any code, verify which module you're in and confirm that module's rules. Ask yourself: "Is this data type certain right now?" If not, use Discriminated Unions to solidify the structure.

10. **Function Design:** Functions must be small and purpose-focused. Large functions with complex logic hinder readability and maintenance. Each function should have a single responsibility and be decomposable into named helper functions.

11. **State Machines for Scraper:** Scraper processes (initialization, login, search, data extraction, error handling) must not be managed with simple boolean flags. Instead, use a rigid State Machine: `status: 'IDLE' | 'SCANNING' | 'EXTRACTING' | 'COMPLETED' | 'FAILED'`.

# ARCHITECTURAL BLUEPRINT (The Stack)

- **Runtime:** Node.js (v20+) with TypeScript (5.3+).
- **Monorepo:** pnpm workspaces — `apps/` (uygulamalar) + `packages/` (paylaşılan kütüphaneler).
- **Backend:** NestJS (v10+, Modular Architecture) — `apps/backend/`.
- **Frontend:** Next.js 15 (App Router), Tailwind CSS, Shadcn/UI — `apps/web/` (gelecek).
- **Database:** PostgreSQL (v15+) with Prisma ORM — `packages/database/`.
- **Shared Types:** Discriminated unions, Zod schemas, constants — `packages/shared/`.
- **Scraping Engine:** Playwright with `playwright-extra-plugin-stealth` & `fingerprint-generator`.
- **Intelligence Layer:** OpenAI GPT-4o mini for parsing Job Descriptions and semantic scoring.
- **Validation:** Zod for strict schema validation of LLM outputs.
- **Package Manager:** pnpm (v9+) exclusively.
- **Containerization:** Docker Compose for PostgreSQL, pgAdmin, Redis (gelecek).

## Monorepo Folder Convention

```text
.
├── apps/
│   └── backend/             # NestJS Application (Module A, B, C burada yaşar)
├── packages/
│   ├── database/            # Prisma Schema, Generated Client, Migrations
│   └── shared/              # Zod Schemas, TypeScript Interfaces, Constants
├── docker-compose.yml       # Infrastructure (PostgreSQL, pgAdmin)
├── pnpm-workspace.yaml      # Workspace tanımları
├── tsconfig.base.json       # Paylaşılan TypeScript config
└── .env                     # Root environment variables
```

### Package Naming Convention
- Workspace paketleri `@scrape/` scope'u altında adlandırılır.
- `@scrape/database`, `@scrape/shared`, `@scrape/backend`.
- Cross-package import'lar: `import { JobListing } from '@scrape/shared';`

# CORE MODULES & CONSTRAINTS

## Module A: The Ghost Scraper (Data Ingestion)

**Objective:** Bypass Cloudflare, TLS Fingerprinting, and Bot Detection on job boards.

**Requirements:**
- Mandatory use of `playwright-extra-plugin-stealth`.
- Handle multi-keyword searches concurrently (Worker Threads or async queue pattern).
- Implement resilient selectors (CSS + XPath fallbacks) to handle dynamic class names.
- Retry mechanism with exponential backoff (max 3 attempts per page).

**Success Metrics:**
- Extract 50+ job listings per location per keyword within 2 minutes.
- Zero 403 Forbidden or Captcha triggers per 100 requests.
- Parse: Job Title, Company, Location, Salary (if available), Description, URL.
- Data accuracy: >95% field extraction success rate.

---

## Module B: CV Parser & Skills Extractor

**Objective:** Convert raw CV/User Input into a structured, type-safe profile.

**Requirements:**
- Use OpenAI GPT-4o mini to extract: skills, years of experience, tech stack, preferred roles.
- Validate all LLM outputs with Zod schemas before persisting.
- Support plain text, PDF (via pdfparse), and LinkedIn profile imports (future).

**Success Metrics:**
- Parse CV within 2 seconds.
- Extraction accuracy: >90% precision for skills and experience.
- Support 50+ programming languages and frameworks.
- Graceful degradation for incomplete inputs.

---

## Module C: Semantic Matcher (The Brain)

**Objective:** Compare extracted Job Descriptions with User Profiles and rank matches.

**Requirements:**
- Scoring formula: `(Matched Skills / Required Skills) × 0.6 + (Experience Fit) × 0.4`
- Only return jobs with confidence score > 50%.
- Provide a summary explaining why each job matches.
- Filter by: location, salary range, seniority level.

**Success Metrics:**
- Match 100 jobs in <3 seconds.
- Precision: >80% of "Perfect Matches" are relevant to user input.
- Recall: <5% of truly matching jobs are missed (false negatives).
- Ranking quality: Top 10 results have >70% average match score.

# DATA FLOW ARCHITECTURE

```
User Input (Skills, Preferences)
    ↓
[Module B: CV Parser]
    ↓
Normalized UserProfile (Type-Safe)
    ↓
[Module A: Ghost Scraper] ──→ [Multiple Concurrent Workers]
    ↓
Raw Job Listings (JobListing[])
    ↓
[Zod Validation]
    ↓
Cleaned Job Data
    ↓
[Module C: Semantic Matcher]
    ↓
[Scoring Algorithm]
    ↓
MatchedJob[] (filtered score > 50%)
    ↓
[Dashboard: Next.js Frontend]
    ↓
User Sees: "Perfect Matches" with Explanations
```

---

# DATABASE SCHEMA (PostgreSQL + Prisma ORM)

Veritabanı şeması `packages/database/prisma/schema.prisma` dosyasında tanımlanır.
Prisma ORM ile type-safe query'ler yazılır — raw SQL yasaktır (güvenlik).

## Tablolar

### User
- `id` (UUID, PK)
- `email` (unique)
- `name`
- `techStack` (String[]) — kullanıcının bildiği teknolojiler
- `experienceYears` (Int)
- `preferredRoles` (String[])
- `preferredLocations` (String[])
- `createdAt`, `updatedAt`

### JobListing
- `id` (UUID, PK)
- `externalId` (String, unique) — LinkedIn job ID
- `url` (String, unique) — doğrudan ilan linki
- `title`, `company`, `location`
- `salary` (String?) — ham maaş string'i
- `salaryMin`, `salaryMax` (Int?) — normalize edilmiş TRY/ay
- `salaryCurrency` (Enum: TRY, USD, EUR)
- `salaryPeriod` (Enum: MONTHLY, YEARLY)
- `description` (Text?)
- `requirements` (String[])
- `skills` (Json) — ExtractedSkill[]
- `seniorityLevel`, `employmentType` (String?)
- `postedDate` (String?)
- `source` (Enum: LINKEDIN, INDEED, ...)
- `scrapedAt` (DateTime)
- `createdAt`, `updatedAt`

### MatchResult
- `id` (UUID, PK)
- `userId` (FK → User)
- `jobId` (FK → JobListing)
- `score` (Float) — 0-100 arası match yüzdesi
- `explanation` (Text) — AI tarafından üretilen eşleşme gerekçesi
- `matchedSkills` (String[]) — eşleşen yetenekler
- `missingSkills` (String[]) — eksik yetenekler
- `createdAt`
- Unique constraint: (userId, jobId)

### ScraperAudit
- `id` (UUID, PK)
- `status` (Enum: IDLE, SCANNING, EXTRACTING, COMPLETED, FAILED) — State Machine
- `keyword` (String)
- `location` (String)
- `totalFound` (Int)
- `totalExtracted` (Int)
- `errorCount` (Int)
- `errorDetails` (Json?) — ScraperError[]
- `durationMs` (Int)
- `startedAt`, `completedAt` (DateTime)

**Not:** Tüm migration'lar `prisma migrate dev` ile yönetilir. Seed data `prisma/seed.ts` ile oluşturulur.

---

# ERROR HANDLING STRATEGY

All errors must be typed and centralized. Never use `any`.

## Error Categories

### Scraper Errors
```typescript
type ScraperError = 
  | { code: 'CLOUDFLARE_BLOCKED'; retryAfter: number; }
  | { code: 'CAPTCHA_DETECTED'; url: string; }
  | { code: 'TIMEOUT'; timeout: number; }
  | { code: 'PARSING_FAILED'; html: string; selector: string; }
  | { code: 'NETWORK_ERROR'; message: string; }
  | { code: 'RATE_LIMITED'; resetAt: Date; };

type ScraperResult<T> = 
  | { status: 'success'; data: T }
  | { status: 'error'; error: ScraperError };
```

### Parser Errors
```typescript
type ParserError = 
  | { code: 'INVALID_CV_FORMAT'; format: string; }
  | { code: 'MISSING_REQUIRED_FIELDS'; fields: string[]; }
  | { code: 'LLM_PARSING_FAILED'; reason: string; }
  | { code: 'VALIDATION_FAILED'; zodError: string; };

type ParserResult<T> = 
  | { status: 'success'; data: T }
  | { status: 'error'; error: ParserError };
```

### Matcher Errors
```typescript
type MatcherError = 
  | { code: 'INVALID_USER_PROFILE'; reason: string; }
  | { code: 'NO_JOBS_AVAILABLE'; count: number; }
  | { code: 'SCORING_FAILED'; jobId: string; };

type MatcherResult<T> = 
  | { status: 'success'; data: T }
  | { status: 'error'; error: MatcherError };
```

## Centralized ErrorHandler

```typescript
export class ErrorHandler {
  static handle(error: unknown): AppError {
    if (error instanceof ValidationError) return this.handleValidation(error);
    if (error instanceof NetworkError) return this.handleNetwork(error);
    // log, transform, return typed error
  }
}
```

---

# TESTING STRATEGY

## Unit Tests
- Test all helper functions (`extractTechStack`, `calculateMatchScore`, etc.)
- Coverage: >90% for core logic.
- Use Jest with TypeScript support.

## Integration Tests
- Test module interactions (Parser → Matcher flow).
- Test database Prisma queries.
- Mock LLM responses with fixed outputs.

## E2E Tests
- Full flow: Upload CV → Scrape jobs → Match → Display results.
- Use Playwright for UI testing.
- Test with real data on staging environment.

## Performance Tests
- Scraper: 50+ jobs within 2 minutes per keyword.
- Matcher: 100 jobs matched within 3 seconds.
- Parser: CV parsed within 2 seconds.

---

# IMPLEMENTATION RULES

- **Package Manager:** Only `pnpm`.
- **Import Policy:** Always use path alias (`@/src/...`), never relative imports.
- **Error Handling:** `any` is forbidden. Use the centralized `ErrorHandler` with typed errors.
- **Named Helpers:** Complex logic must always be broken into small, named helper functions.
- **Type Safety:** Leverage Discriminated Unions for state management. Compile-time errors over runtime.
- **Documentation:** Use JSDoc comment lines for all functions following TypeScript standards. Example:
  ```typescript
  /**
   * Extracts tech stack from user profile text
   * @param profileText Raw user input or CV text
   * @returns Array of identified technologies
   * @throws ParserError if validation fails
   */
  function extractTechStack(profileText: string): string[] {
    // implementation
  }
  ```
- **Communication Language:** Always communicate with the user in Turkish (Türkçe). Respond to requests and explanations in Turkish unless explicitly asked otherwise.

---

# INITIAL TASK DEFINITION

When given a task:

1. **Verify Module Context:** Confirm which module (A, B, or C) you're working in.
2. **Type Safety Check:** Ask "Is this data type certain right now?" If not, use Discriminated Unions.
3. **Break Down Logic:** Use named helper functions for any complex logic.
4. **Validate Output:** Use Zod to validate LLM outputs and external API responses.
5. **Error Handling:** Route all errors through the centralized `ErrorHandler`.
6. **Reference Roadmap:** Consult ROADMAP.md to align with phases and milestones.
