# Scrape & Compare

Kaynak koduna dayali durum dokumani (Mayis 2026).

Bu repo, LinkedIn ilanlarini toplayan bir scraper, ilanlari kullanici profiline gore puanlayan bir matcher ve bunlari kullanan bir Next.js panelinden olusur.

## Mevcut Urun Siniri

Proje bugun su uc akisi uctan uca calistiriyor:

1. Profil olustur veya guncelle
2. LinkedIn ilanlarini scrape et ve veritabanina kaydet
3. Ilanlari AI ile batch olarak puanla ve panelde filtrele/sirala

Bu kapsam disinda kalan basliklar asagida Kapsam Disi bolumunde net sekilde listelenmistir.

## Mimari

- Monorepo: pnpm workspaces
- Backend: NestJS + BullMQ + Prisma
- Frontend: Next.js App Router
- Veritabani: PostgreSQL
- Kuyruk: Redis
- AI: Gemini API

Workspace yapisi:

- apps/backend: REST API, queue workerlar, scraping ve matcher mantigi
- apps/web: dashboard, profile, matches arayuzu
- packages/shared: ortak tipler, Zod schemalar, sabitler
- packages/database: Prisma schema ve generated client

## Servisler Ne Yapiyor

### Backend (apps/backend)

Ana process:

- HTTP API sunar
- Ayni process icinde BullMQ workerlari calisir

Backend modulleri:

- ScraperModule
- JobsModule
- MatcherModule
- UsersModule

Scraper:

- Playwright + stealth ile LinkedIn scrape
- Resource blocking ile hizli SSR parse
- Paralel tab havuzu
- Retry + adaptive backoff
- Skill extraction + salary parsing
- ScraperAudit state machine kayitlari

Matcher:

- Kullaniciya bagli ilanlari batch halinde puanlar
- Sonuclari MatchResult tablosuna upsert eder
- Kuyruk bazli ve rate-limit kontrollu calisir
- Hata durumlarinda fallback skor stratejisi uygular

Web:

- /dashboard: scrape tetikleme, filtre/sort/pagination, scoring tetikleme
- /profile: kullanici CRUD arayuzu
- /matches: match sonuclarini listeleme

## API Yuzeyi (Kodda Olan)

Tum endpointler /api prefix altindadir.

### Scraper

- POST /api/scrape/trigger
- GET /api/scrape/status/:jobId

### Jobs

- GET /api/jobs
- DELETE /api/jobs/user/:userId
- DELETE /api/jobs/user/:userId/job/:jobId

### Matcher

- POST /api/matcher/score
- GET /api/matcher/results/:userId

### Users

- POST /api/users
- GET /api/users
- GET /api/users/:id
- PATCH /api/users/:id

## Scriptler

### Root

- pnpm dev: backend dev
- pnpm dev:web: web dev
- pnpm dev:all: backend + web
- pnpm scrape: backend CLI scrape
- pnpm build: tum workspace build
- pnpm lint: tum workspace lint/ts check
- pnpm db:generate
- pnpm db:migrate
- pnpm db:studio
- pnpm docker:up
- pnpm docker:down

### Backend

- pnpm --filter @scrape/backend dev
- pnpm --filter @scrape/backend start
- pnpm --filter @scrape/backend scrape
- pnpm --filter @scrape/backend test

### Web

- pnpm --filter @scrape/web dev
- pnpm --filter @scrape/web build
- pnpm --filter @scrape/web start

## Hizli Kurulum

1. Bagimliliklar

pnpm install

2. Altyapi

docker compose up -d

3. Prisma

pnpm --filter @scrape/database generate
pnpm --filter @scrape/database migrate

4. Playwright browser

pnpm exec playwright install chromium

5. Uygulamalar

pnpm dev:all

Web: http://localhost:3001
Backend: http://localhost:3000/api

## Ortam Degiskenleri

Root .env.example dosyasinda aktif olarak kullanilan ana degiskenler:

- PORT
- CORS_ORIGIN
- DATABASE_URL
- POSTGRES_USER
- POSTGRES_PASSWORD
- POSTGRES_DB
- REDIS_HOST
- REDIS_PORT
- HEADLESS
- SLOW_MO
- MAX_JOBS_PER_KEYWORD
- REQUEST_DELAY_MIN
- REQUEST_DELAY_MAX
- KEYWORDS
- LOCATION
- FETCH_DETAILS
- MAX_DETAIL_FETCH
- PARALLEL_TABS
- SEARCH_CONCURRENCY
- GEMINI_API_KEY
- GEMINI_MODEL
- GEMINI_FALLBACK_MODEL
- MATCHER_BATCH_SIZE
- MATCHER_RATE_LIMIT
- MATCHER_MIN_SCORE

Web icin:

- NEXT_PUBLIC_API_URL

## Bu Asamada Tamamlanan Basliklar

Kaynak koduna gore aktif ve tamamlanmis basliklar:

1. Monorepo migration ve package ayrimi tamam
2. Queue tabanli scrape ve matcher akislari tamam
3. Kullanici CRUD endpointleri aktif
4. Dashboard/Profile/Matches sayfalari aktif
5. Scoring polling ve queue entegrasyonu aktif
6. Is kartlarinda seniority ve work type gosterimi frontendde mevcut
7. Skill overflow icin popover davranisi mevcut
8. Yeniden puanlama icin onay ve countdown davranisi mevcut
9. Footer bileseni layouta entegre

## Net Kapsam Sinirlari (Bilincli Olarak)

Su an sistem bunlari yapmiyor veya garanti etmiyor:

1. Kimlik dogrulama/authorization yok (tek istemci varsayimi)
2. LinkedIn disi kaynaklar (Indeed, Glassdoor) aktif degil
3. WebSocket/SSE real-time stream yok, polling var
4. CV PDF parse ve otomatik profil cikarma aktif degil
5. Scheduler/cron otomatik scrape aktif degil
6. Multi-tenant rol modeli yok
7. Job detail ayri sayfasi yok

## Teknik Notlar ve Mevcut Kisitlar

1. LinkedIn aramasi URL seviyesinde location parametresi ile calisiyor
2. Remote/Hybrid/On-site tespiti scraper tarafinda yapiliyor
3. Veritabaninda JobListing.workType alani mevcut
4. Jobs list API DTO sunda workType alani su an expose edilmiyor

Son madde bilincli bir dokumantasyon notudur: workType parse ve persistence var, fakat GET /api/jobs response contractina tam yansitma icin backend DTO select katmaninda ek adim gerekiyor.

## Veritabani Modelleri

- User
- JobListing
- MatchResult
- ScraperAudit
- UserJobListing

Ek olarak enumlar:

- SalaryCurrency
- SalaryPeriod
- JobSource
- ScraperStatus

## Test ve Kalite

Backend tarafinda vitest testleri mevcut:

- scraper concurrency/config/delay
- matcher processor/service
- queue davranisi
- users servisleri

Type safety:

- shared paketinde Zod schema + TS tipleri
- backendte ZodValidationPipe ile request dogrulama
- Prisma ile type-safe DB erisimi

## Lisans

ISC
