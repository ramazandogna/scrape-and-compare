# 🔍 Scrape & Compare — AI-Driven Job Matching Engine

AI destekli LinkedIn iş ilanı scraper'ı ve eşleştirme motoru. Playwright stealth ile bot korumasını aşar, paralel tab pool ile hızlı çalışır, skill extraction ve salary parsing ile verileri zenginleştirir.

## ✨ Özellikler

- **Ghost Scraper:** Playwright + Stealth plugin ile LinkedIn bot korumasını bypass eder
- **Resource Blocking:** JS/CSS/Image/Font bloklanır, sadece HTML yüklenir (10x hızlı)
- **Paralel Tab Pool:** N tab aynı anda detay sayfası çeker
- **SSR Parse:** LinkedIn SSR olduğundan scroll/click gerekmez
- **Skill Extraction:** 80+ teknoloji, 8 kategoride (frontend, backend, devops...)
- **Salary Parsing:** TL/USD/EUR parse + aylık TRY'ye normalize
- **Batch + Retry:** Rate limit'e takılınca exponential backoff ile yeniden dener
- **Adaptive Delay:** Çok keyword varsa gecikmeleri otomatik artırır
- **Modular Monolith:** pnpm workspaces ile paylaşılan tipler, veritabanı, backend ayrımı
- **Type-Safe:** Discriminated unions, Zod validasyon, strict TypeScript

## 🛠️ Teknoloji

| Katman | Teknoloji |
|--------|-----------|
| Runtime | Node.js 20+ |
| Dil | TypeScript 5.9 (strict, project references) |
| Monorepo | pnpm 10+ workspaces |
| Backend | NestJS 11 (Modular Architecture) |
| Database | PostgreSQL 15 + Prisma ORM 6 |
| Scraping | Playwright + playwright-extra + stealth plugin |
| Validation | Zod (schema validation) |
| Infrastructure | Docker Compose (PostgreSQL + pgAdmin) |
| Output | JSON (output/ klasörü) |

## 🚀 Kurulum

```bash
# 1. Repoyu klonla
git clone https://github.com/your-username/scrape-and-compare.git
cd scrape-and-compare

# 2. Bağımlılıkları yükle
pnpm install

# 3. Prisma client generate et
pnpm --filter @scrape/database generate

# 4. Playwright browser'larını yükle
pnpm exec playwright install chromium

# 5. .env dosyasını düzenle
cp .env.example .env
# DATABASE_URL, KEYWORDS, LOCATION vb. ayarla

# 6. PostgreSQL altyapısını başlat
docker compose up -d

# 7. Veritabanı migration'larını çalıştır
pnpm --filter @scrape/database migrate
```

## ⚙️ Konfigürasyon (.env)

```env
# Veritabanı
DATABASE_URL=postgresql://scrape:scrape_dev_2024@localhost:5432/scrape_db

# Browser ayarları
HEADLESS=false          # true = arka planda, false = browser görünür (debug)
SLOW_MO=0               # Aksiyon arası yapay gecikme (ms)

# Arama parametreleri
KEYWORDS=Frontend Developer,React Developer    # Virgülle ayrılmış
LOCATION=Turkey

# Scrape limitleri
MAX_JOBS_PER_KEYWORD=50
REQUEST_DELAY_MIN=1000   # ms
REQUEST_DELAY_MAX=3000   # ms

# Detay çekme
FETCH_DETAILS=true       # description + requirements çek
MAX_DETAIL_FETCH=60      # max kaç ilan detaylandırılacak

# Paralel tab sayısı
PARALLEL_TABS=5          # fazla olursa LinkedIn rate limit verir
```

## 📖 Kullanım

```bash
# Fast scraper (CLI — NestJS standalone context)
pnpm --filter @scrape/backend scrape

# HTTP server başlat
pnpm --filter @scrape/backend start

# Prisma Studio (veritabanı görsel arayüzü)
pnpm --filter @scrape/database studio

# TypeScript build (tüm workspace)
pnpm build
```

Scraper çıktısı `output/job-YYYY-MM-DD-HH-MM.json` olarak kaydedilir.

## 📁 Proje Yapısı

```
scrape-and-compare/
├── apps/
│   └── backend/                     # @scrape/backend — NestJS uygulaması
│       └── src/
│           ├── main.ts              # HTTP server giriş noktası (port 3000)
│           ├── cli.ts               # CLI scraper giriş noktası
│           ├── app.module.ts        # Root module (Database + Scraper)
│           ├── scraper/
│           │   ├── scraper.module.ts    # NestJS module tanımı
│           │   ├── scraper.service.ts   # Fast LinkedIn scraper (~740 satır)
│           │   └── browser.service.ts   # Playwright stealth yönetimi
│           ├── database/
│           │   ├── database.module.ts   # @Global Prisma module
│           │   └── prisma.service.ts    # PrismaClient lifecycle hooks
│           ├── extractors/
│           │   ├── skill.extractor.ts   # 80+ teknoloji, 8 kategori
│           │   └── salary.parser.ts     # TL/USD/EUR → TRY normalize
│           ├── utils/
│           │   └── helpers.ts           # sleep, randomBetween, logger
│           └── types/
│               └── declarations.d.ts    # Stealth plugin type stubs
├── packages/
│   ├── shared/                      # @scrape/shared — paylaşılan tipler
│   │   └── src/
│   │       ├── types/               # JobListing, ScraperError, ScraperResult<T>
│   │       ├── schemas/             # Zod: jobListing, skill, salary, llm
│   │       └── constants/           # EXCHANGE_RATES, SCRAPER_DEFAULTS
│   └── database/                    # @scrape/database — Prisma ORM
│       ├── prisma/schema.prisma     # 4 tablo, 4 enum
│       └── src/
│           ├── index.ts             # PrismaClient + tip re-export
│           └── generated/prisma/    # Prisma generated client (gitignore)
├── docker-compose.yml               # PostgreSQL 15 + pgAdmin
├── tsconfig.base.json               # Shared strict TS config
├── tsconfig.json                    # Project references hub
├── pnpm-workspace.yaml              # apps/* + packages/*
└── .env                             # DATABASE_URL, KEYWORDS, LOCATION
```

## 📊 Çıktı Formatı

```json
{
  "scrapeTimestamp": "2025-01-15T14:30:00.000Z",
  "query": {
    "keywords": ["Frontend Developer", "React Developer"],
    "location": "Turkey"
  },
  "totalJobs": 58,
  "jobs": [
    {
      "id": "4123456789",
      "title": "Senior Frontend Developer",
      "company": "TechCorp",
      "location": "İstanbul, Turkey",
      "salary": null,
      "salaryParsed": null,
      "description": "We are looking for...",
      "requirements": ["3+ years React experience", "TypeScript"],
      "skills": [
        { "name": "React", "category": "frontend", "isMain": true },
        { "name": "TypeScript", "category": "frontend", "isMain": true },
        { "name": "Docker", "category": "devops", "isMain": false }
      ],
      "seniorityLevel": "Mid-Senior level",
      "employmentType": "Full-time",
      "link": "https://www.linkedin.com/jobs/view/4123456789",
      "postedDate": "2 days ago",
      "scrapedAt": "2025-01-15T14:30:00.000Z"
    }
  ],
  "errors": []
}
```

## 🏎️ Performans

| Metrik | Eski Scraper | Fast Scraper |
|--------|-------------|-------------|
| Sayfa yükleme | ~3-5sn | ~500ms |
| 58 job + detay | ~5dk+ | ~90sn |
| Resource kullanımı | Tam render | Sadece HTML |
| Paralel çekme | Sıralı (1 tab) | 5 paralel tab |
| Success rate | ~85% | ~95%+ |

## 📋 Patch Notes

### v2.0.0 — Modular Monolith Migration

**Mimari Değişiklikler:**
- 🏗️ **pnpm Workspaces:** Flat `src/` yapısından `apps/` + `packages/` monorepo'ya geçiş
- 📦 **@scrape/shared:** Tüm tipler, Zod şemaları ve sabitler ayrı pakette
- 🗃️ **@scrape/database:** PostgreSQL + Prisma ORM (4 tablo, 4 enum, generated client)
- 🚀 **@scrape/backend:** NestJS modüler yapı (ScraperModule, DatabaseModule)
- 🐘 **Docker Compose:** PostgreSQL 15 + pgAdmin altyapısı
- 📐 **TypeScript Project References:** Strict build sırası (shared → database → backend)

**Type Safety:**
- 🎯 **Discriminated Unions:** ScraperError, ParserError, MatcherError — her state'in kendi tipi
- 🔒 **Zod Validation:** jobListingSchema, extractedSkillSchema, salaryParsedSchema, llmSkillExtractionSchema
- 🚫 **`any` yasak:** Tüm codebase strict TypeScript, sıfır `any`

**NestJS Entegrasyon:**
- 💉 **Dependency Injection:** ScraperService, BrowserService, PrismaService
- 🌐 **İki giriş noktası:** `main.ts` (HTTP server) + `cli.ts` (standalone scraper)
- 🌍 **@Global DatabaseModule:** PrismaService tüm modüllerden erişilebilir

**Prisma Schema:**
- 👤 User (profil, techStack, preferredRoles)
- 📋 JobListing (ilan detayları, skills, salary normalization)
- 🎯 MatchResult (AI eşleşme, score, explanation)
- 📊 ScraperAudit (state machine: IDLE→SCANNING→EXTRACTING→COMPLETED/FAILED)

### v1.0.0 — İlk Stabil Sürüm

**Yeni Özellikler:**
- ⚡ **Fast Scraper:** Resource blocking + paralel tab pool ile 10x hızlı scraping
- 🧠 **Skill Extraction:** 80+ teknoloji, 8 kategoride otomatik tespit (main/side ayrımı)
- 💰 **Salary Parser:** TL/USD/EUR parse, yıllık→aylık normalize, statik kur çevirisi
- 🔑 **Env-based Keywords:** `.env` dosyasından virgülle ayrılmış keyword desteği
- ⏱️ **Adaptive Delay:** 2'den fazla keyword varsa gecikmeleri 1.5x artırır
- 📂 **Timestamp Output:** `job-YYYY-MM-DD-HH-MM.json` formatında benzersiz dosya adları
- 🛡️ **Stealth Plugin:** Bot korumasını bypass eden Playwright stealth entegrasyonu
- 🔄 **Batch + Retry:** Rate limit'e takılınca exponential backoff (3s→6s) + cooldown (8s)
- 📊 **Detaylı Çıktı:** skills, salaryParsed, requirements, seniorityLevel, employmentType

**Düzeltmeler:**
- 🐛 Stealth plugin placeholder → `puppeteer-extra-plugin-stealth@2.11.2` ile değiştirildi
- 🐛 Job ID parse hatası düzeltildi (regex + data-entity-urn fallback)
- 🐛 tsx/esbuild `__name` bug'ı çözüldü (page.evaluate'da named function yasak)

**Performans:**
- 58 iş ilanı + 58 description + 53 requirements = 91.4 saniye
- 0 hata, %100 description success rate
- Resource blocking: 138KB HTML vs 1.2MB full render

## 📜 Lisans

ISC
