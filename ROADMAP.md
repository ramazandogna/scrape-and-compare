# 🚀 PROJECT: AI-Driven Talent Acquisition & Job Matching Engine

AI destekli iş arama motoru. LinkedIn gibi platformları scrape eder, LLM ile fırsatları puanlar ve en uygun eşleşmeleri sunar.

---

## 🏗️ 1. ARCHITECTURAL BLUEPRINT (The Stack)

| Katman | Teknoloji |
|--------|-----------|
| Runtime | Node.js 20+, TypeScript 5.9+ |
| Monorepo | pnpm workspaces (`apps/` + `packages/`) |
| Backend | NestJS 11 (Modular Architecture) — `apps/backend/` |
| Frontend | Next.js 15 (App Router) + Tailwind + Shadcn/UI — `apps/web/` *(gelecek)* |
| Database | PostgreSQL 15 + Prisma ORM 6 — `packages/database/` |
| Shared | Discriminated unions, Zod schemas — `packages/shared/` |
| Scraping | Playwright + stealth plugin + resource blocking |
| Intelligence | OpenAI GPT-4o mini (JD parsing + semantic scoring) |
| Infrastructure | Docker Compose (PostgreSQL + pgAdmin) |

### Monorepo Yapısı

```
scrape-and-compare/
├── apps/
│   └── backend/                 # NestJS — scraper, API, iş mantığı
│       └── src/
│           ├── main.ts          # HTTP server giriş noktası
│           ├── cli.ts           # CLI scraper giriş noktası
│           ├── app.module.ts    # Root module (Database + Scraper)
│           ├── scraper/         # LinkedIn fast scraper (Playwright stealth)
│           ├── database/        # PrismaService (@Global, lifecycle hooks)
│           ├── extractors/      # Skill extraction + Salary parsing
│           └── utils/           # Logger, sleep, helpers
├── packages/
│   ├── shared/                  # Paylaşılan tipler, Zod şemaları, sabitler
│   │   └── src/
│   │       ├── types/           # JobListing, ScraperError (discriminated union)
│   │       ├── schemas/         # Zod validasyonları
│   │       └── constants/       # EXCHANGE_RATES, SCRAPER_DEFAULTS
│   └── database/                # Prisma schema + client re-export
│       ├── prisma/schema.prisma # 4 tablo, 4 enum
│       └── src/index.ts         # PrismaClient + tip re-export
├── docker-compose.yml           # PostgreSQL 15 + pgAdmin
├── tsconfig.base.json           # Shared strict TS config
└── pnpm-workspace.yaml          # Workspace tanımları
```

### Bağımlılık Akışı

```
@scrape/shared (saf tipler)
       ↓
@scrape/database (Prisma + shared tipleri)
       ↓
@scrape/backend (her ikisini kullanır)
```

---

## 🛠️ 2. CORE MODULES

### Module A: The Ghost Scraper (Data Ingestion)
**Konum:** `apps/backend/src/scraper/`

- Playwright + stealth plugin ile bot koruması bypass
- Resource blocking (JS/CSS/Image/Font) — sadece HTML yüklenir
- Paralel tab pool ile concurrent detay çekme
- Exponential backoff retry (max 3 attempt)
- **Hedef:** 50+ ilan / keyword / 2 dakika, 0 captcha

### Module B: CV Parser & Skills Extractor
**Konum:** `apps/backend/src/extractors/` + gelecek LLM servisi

- OpenAI GPT-4o mini ile skill/experience extraction
- Zod ile tüm LLM çıktıları validate edilir
- Plain text, PDF desteği (pdfparse)
- **Hedef:** <2sn parse, >90% precision

### Module C: Semantic Matcher (The Brain)
**Konum:** Gelecek — `apps/backend/src/matcher/`

- Scoring: `(Matched Skills / Required) × 0.6 + (Experience Fit) × 0.4`
- Score > 50% filtresi, eşleşme açıklaması
- **Hedef:** 100 iş / <3sn, >80% precision

---

## 🗺️ 3. EXECUTION ROADMAP

### Phase 0: Foundation ✅
- [x] Fast scraper v1.0 (Playwright stealth, resource blocking, paralel tabs)
- [x] Skill extraction (80+ teknoloji, 8 kategori)
- [x] Salary parsing (TL/USD/EUR → TRY normalize)
- [x] JSON output (timestamped dosyalar)

### Phase 1: Modular Monolith Migration ✅
- [x] pnpm workspaces monorepo yapısı
- [x] `@scrape/shared` — tipler, Zod şemaları, sabitler
- [x] `@scrape/database` — Prisma schema (4 tablo, 4 enum), generated client
- [x] `apps/backend` — NestJS modüler yapı (ScraperModule, DatabaseModule)
- [x] Docker Compose altyapısı (PostgreSQL 15 + pgAdmin)
- [x] TypeScript project references (strict, zero errors)
- [x] Eski flat `src/` yapısından tam migration + temizlik

### Phase 2: Database Integration 🔜
- [ ] PostgreSQL bağlantı testi + Prisma migration
- [ ] Scraper çıktılarını JobListing tablosuna kaydet
- [ ] ScraperAudit state machine (IDLE → SCANNING → EXTRACTING → COMPLETED/FAILED)
- [ ] Deduplication (externalId + url unique constraint)

### Phase 3: Intelligence (LLM Scoring)
- [ ] CV/Profil parse servisi (GPT-4o mini)
- [ ] Zod validated LLM output pipeline
- [ ] Semantic matching + scoring algoritması
- [ ] MatchResult tablosuna sonuçları kaydet

### Phase 4: Interface (Next.js Dashboard)
- [ ] `apps/web` — Next.js 15 App Router
- [ ] Kullanıcı profil girişi (skills, preferences)
- [ ] Eşleşme sonuçları kartları (match %, açıklama)
- [ ] "Apply" butonu → orijinal ilan linki

---

## 🗄️ 4. DATABASE SCHEMA

| Tablo | Açıklama |
|-------|----------|
| **User** | Kullanıcı profili (techStack, experienceYears, preferredRoles) |
| **JobListing** | Scrape edilen ilanlar (title, company, skills, salary*, requirements) |
| **MatchResult** | AI eşleşme sonuçları (score, explanation, matchedSkills, missingSkills) |
| **ScraperAudit** | Scraper çalışma logları (state machine, stats, errors) |

**Enum'lar:** `SalaryCurrency`, `SalaryPeriod`, `JobSource`, `ScraperStatus`