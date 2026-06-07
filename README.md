<div align="center">

# Scrape & Compare

**AI-powered job-listing scraper + fit scorer.**
Stop scrolling LinkedIn for hours — build your profile once, let the system pull 50+ fresh listings, and let AI auto-filter the noise with a fit score.

![Hero](./assets/hero.png)

[![NestJS](https://img.shields.io/badge/NestJS-E0234E?style=flat&logo=nestjs&logoColor=white)](https://nestjs.com/)
[![Next.js](https://img.shields.io/badge/Next.js%2015-000000?style=flat&logo=nextdotjs&logoColor=white)](https://nextjs.org/)
[![TypeScript](https://img.shields.io/badge/TypeScript-3178C6?style=flat&logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![Prisma](https://img.shields.io/badge/Prisma-2D3748?style=flat&logo=prisma&logoColor=white)](https://www.prisma.io/)
[![PostgreSQL](https://img.shields.io/badge/PostgreSQL-4169E1?style=flat&logo=postgresql&logoColor=white)](https://www.postgresql.org/)
[![Redis](https://img.shields.io/badge/Redis-DC382D?style=flat&logo=redis&logoColor=white)](https://redis.io/)
[![BullMQ](https://img.shields.io/badge/BullMQ-FF4B4B?style=flat)](https://bullmq.io/)
[![Playwright](https://img.shields.io/badge/Playwright-2EAD33?style=flat&logo=playwright&logoColor=white)](https://playwright.dev/)
[![Gemini](https://img.shields.io/badge/Google%20Gemini-4285F4?style=flat&logo=google&logoColor=white)](https://ai.google.dev/)
[![TailwindCSS](https://img.shields.io/badge/Tailwind%20CSS-06B6D4?style=flat&logo=tailwindcss&logoColor=white)](https://tailwindcss.com/)

</div>

> 🎥 **Demo video:** Not included in the repo due to its size (GitHub's 100MB limit).
> It will be added soon as an external link (YouTube/Loom).

---

## 📚 Table of Contents

1. [The Project in One Sentence](#the-project-in-one-sentence)
2. [Why This Project?](#why-this-project)
3. [Screenshots](#screenshots)
4. [Architecture: Monorepo + Microservice Style](#architecture-monorepo--microservice-style)
5. [Backend — Scraping Strategy](#backend--scraping-strategy)
6. [AI Matching Engine](#ai-matching-engine)
7. [Authentication](#authentication)
8. [Frontend Experience](#frontend-experience)
9. [Tech Stack](#tech-stack)
10. [Quick Start](#quick-start)
11. [Project Structure](#project-structure)
12. [Roadmap](#roadmap)
13. [Legal Disclaimer](#legal-disclaimer)
14. [License](#license)

---

## The Project in One Sentence

**Build your profile once** — Scrape & Compare collects 50+ fresh listings from
LinkedIn for you, gives each one a **0–100 fit score** via Gemini, and surfaces
only the right ones in your sidebar so you apply where it matters. Spend the rest
of the time on coffee.

## Why This Project?

> Classic job hunting: scroll 200 listings, half don't match your level, most are
> companies you already applied to, and there's no salary info. There goes your day.

Three goals drove this project:

- **Kill the overload.** Never put low-quality, irrelevant listings in front of
  the user.
- **Cut decision time to seconds.** Attach a 0–100 fit score to every listing so
  the user just glances at the number.
- **Keep it self-driving.** The moment a scrape finishes, scoring is queued
  automatically. No two clicks — not even one.

## Screenshots

<div align="center">

### Dashboard — Smart scan + scored cards
![Dashboard](./assets/dashboard-giris.png)

### Matches — 60+ scored listings
![Matches](./assets/eslesmeler-ekran%C4%B1.png)

### Profile — Dark mode + custom accent
![Profile](./assets/profil-ekran%C4%B1-siyah.png)

</div>

---

## Architecture: Monorepo + Microservice Style

A **microservice-style** separation of concerns on a single Docker host: the
backend HTTP API, the BullMQ workers, and the scraper all run inside the same
Node.js process, yet each lives as an **independent module**. If it ever needs to
scale out, moving each one into its own container is a one-line job.

```
┌─────────────────────────────────────────────────────────────────┐
│                       Next.js 15 (Web)                          │
│       Landing · Dashboard · Matches · Favorites · Profile       │
└──────────────────────────┬──────────────────────────────────────┘
                           │  fetch() with httpOnly cookie
                           ▼
┌─────────────────────────────────────────────────────────────────┐
│                    NestJS Backend (single process)              │
│  ┌────────────┐  ┌────────────┐  ┌────────────┐  ┌────────────┐ │
│  │   Auth     │  │   Users    │  │   Jobs     │  │  Matcher   │ │
│  │  JWT+bcryp │  │  CRUD/me   │  │ List/Del   │  │  Trigger   │ │
│  └────────────┘  └────────────┘  └────────────┘  └─────┬──────┘ │
│  ┌────────────────────────────────────────────────────┐│        │
│  │             Scraper Module                         ││        │
│  │  controller → service → workers (BullMQ)           ││        │
│  │  ↓                                                 ││        │
│  │  Playwright + stealth + paginated scan             ││        │
│  └────────────────────────────────────────────────────┘│        │
│                                                        ▼        │
│  ┌─────────────────────────────────────────────────────────┐    │
│  │             BullMQ Workers (in same process)            │    │
│  │   • scraper queue  • matcher queue (batched, RPM-cap)   │    │
│  └─────────────────────────────────────────────────────────┘    │
└──────┬──────────────────────────────┬─────────────────┬─────────┘
       │                              │                 │
       ▼                              ▼                 ▼
┌─────────────┐              ┌─────────────────┐  ┌────────────┐
│ PostgreSQL  │              │      Redis      │  │  Gemini    │
│  (Prisma)   │              │ (BullMQ broker) │  │   (LLM)    │
└─────────────┘              └─────────────────┘  └────────────┘
```

### Why this structure?

| Decision | Reason |
|---|---|
| **Monorepo (pnpm workspaces)** | Share types + schemas between backend ↔ frontend via `packages/shared`. A compile-time contract. |
| **Modular NestJS** | Each domain has its own module/service/controller. SRP enforced, testable. |
| **BullMQ + Redis** | Scraping and AI scoring are long-running jobs — decoupled from request-response. HTTP 202 + polling. |
| **Prisma + PostgreSQL** | No raw SQL. Type-safe queries, migrations under version control. |
| **Discriminated unions** | E.g. `ScrapeJobResult = Completed \| Failed` — misuse is caught at compile time. |
| **Zod runtime validation** | Every incoming payload + every LLM response is validated at the API boundary. No `any`. |

---

## Backend — Scraping Strategy

Scrapes LinkedIn's login-less public search. A 4-layer defense against bot
detection:

### 1. Playwright Stealth + Fingerprint
```ts
playwright-extra + puppeteer-extra-plugin-stealth
+ random viewport/user-agent rotation
```
Masks WebGL, `navigator.webdriver`, and Chrome runtime differences.

### 2. Resource Blocking
CSS/font/image/media requests are blocked → the page loads in **~500ms**.
Looks less like a bot and more like a "fast user".

### 3. Smart Pagination — the "50 fresh listings" target
LinkedIn returns ~25 listings per page. The earlier version grabbed a single page
and stopped — leaving the user with 6 listings. The new behavior:

```
target: 50 new listings per keyword
maxPages: 5 (a ceiling, to avoid hammering LinkedIn)

while (collected < target && pageIndex < maxPages):
  fetchPage(start = pageIndex * 25)
  dedup with seenIds/seenLinks (cross-keyword)
  if blocked || exhausted: break
```

The result is reported transparently to the user:
> *"Collected 50/50 listings (3 pages)"* or *"24/50 — LinkedIn hasn't published
> enough fresh listings for this keyword"*

### 4. Adaptive Backoff
Every error is classified into a `ScraperError` discriminated union
(`CLOUDFLARE_BLOCKED`, `CAPTCHA_DETECTED`, `TIMEOUT`, `RATE_LIMITED`, ...).
Each type waits with its own base delay × exponential + jitter. After a batch
with 60%+ failures, an **8-second cooldown** kicks in.

### Parallel Tab Pool
Detail pages are fetched with **5 parallel tabs**. Averages for 50 listings:
- Search phase: ~3-5s
- Detail phase: ~20-30s (parallel)
- Skill/salary extraction: ~1s
- **Total: ~30-60s / 50 listings**

---

## AI Matching Engine

### Gemini Batch Scoring + Fallback Chain

```
GEMINI_MODEL=gemini-2.5-flash               ← primary
GEMINI_FALLBACK_MODEL=gemini-2.5-flash-lite ← 503 overload fallback
QUOTA_FALLBACK=gemini-2.5-flash-lite         ← quota-exceeded fallback
```

On API capacity errors the chain kicks in — the user never sees an error.

### Batch Pipeline
1. Frontend calls `/matcher/score` (`scope: 'unscored' | 'all' | 'selected'`)
2. The controller clears old results and splits new jobs into **batches of 8**
3. Each batch is pushed to the BullMQ queue (rate limit: 4 batches/minute)
4. The worker produces a **single prompt** per batch — saving tokens
5. Results are validated with Zod and upserted into the `MatchResult` table

### Scoring Formula (applied by the LLM)
```
(Matched Skills / Required Skills) × 0.6 + (Experience Fit) × 0.4
```
Output: a 0–100 score + a one-sentence explanation + matched/missing skill lists.

### Automatic Trigger
When a scrape completes, the dashboard passes the `auditId` to `ScoringButton` as
a signal. If it's idle and there are unscored listings, scoring **starts without a
single click**. The user just sees the result.

---

## Authentication

A fully production-grade auth layer:

| Endpoint | Description |
|---|---|
| `POST /auth/signup` | bcrypt hash + JWT cookie + one-click login |
| `POST /auth/login` | Email/password + timing-safe bcrypt comparison |
| `POST /auth/logout` | Clears the httpOnly cookie |
| `POST /auth/forgot-password` | Generates a token, valid for 1 hour (returned in the response in dev mode) |
| `POST /auth/reset-password` | Validates the token + new hash + single-use |
| `GET /auth/me` | Returns the profile from the cookie |

**Security decisions:**
- JWT valid for 7 days, in an `httpOnly + sameSite=lax + secure (prod)` cookie
- Global `AuthGuard` (NestJS `APP_GUARD`) — deny by default, opt out via the `@Public()` decorator
- `@CurrentUser()` decorator for type-safe access to `request.user`
- **Ownership checks** on every endpoint — a user can only access their own data
- Email-enumeration protection — unknown emails return the same message on forgot/login
- Timing-safe comparison — bcrypt is called even when the user doesn't exist
- bcrypt with 10 rounds (~10ms, enough against brute force in practice)

---

## Frontend Experience

### Pages
- **Landing** (`/`) — Hero + features + pricing + about + final CTA. Rotating
  headline, gradient figure, soft pulse animations.
- **Sign-in / Sign-up / Forgot / Reset** — Gradient brand panel + form. The
  hydration flash bug is solved with a blocking inline script.
- **Dashboard** — Hero search + 3-column layout (filter sidebar + cards + right
  sidebar). Smart-pagination report, score badges, favorite heart.
- **Matches** — 60+ scored listings, with average/top score stats.
- **Favorites** — The listings the user has saved, with the option to re-score
  only those.
- **Profile** — Skill/role/location tag inputs, years of experience.

### Design System
- **2 brand accents**: violet (default) + emerald (toggle). The whole UI swaps at
  once via CSS variables.
- **Dark mode** + light mode, with the F5 flash solved by an inline `<head>` script.
- **Animations**: `animate-page-in`, `animate-card-in` + staggered delay (10×),
  `animate-soft-pulse`, `animate-float-cta`, `animate-blob` (background).
- **Skeleton loaders** — prevent the empty-state flash during page transitions.

### State Management
- React Context: `AuthProvider` (status + user), `ThemeProvider` (mode + accent)
- Domain hooks: `useJobs`, `useMatchResults`, `useScraper`, `useScoring`,
  `useFavoriteJobs`, `useUser`
- `credentials: 'include'` on every fetch — the auth cookie is sent automatically

---

## Tech Stack

### Backend
| Layer | Technology |
|---|---|
| Runtime | Node.js 20+ |
| Framework | NestJS 11 (modular, DI, decorator-driven) |
| Database | PostgreSQL 15 + Prisma 6 |
| Queue | BullMQ + Redis |
| Scraping | Playwright + playwright-extra-plugin-stealth |
| AI | Google Gemini (2.5 Flash / Lite chain) |
| Auth | bcryptjs + jsonwebtoken + cookie-parser |
| Validation | Zod (API boundary + LLM output) |
| Logging | Pino (structured JSON, pino-pretty in dev) |
| Testing | Vitest |

### Frontend
| Layer | Technology |
|---|---|
| Framework | Next.js 15 (App Router, RSC) |
| Styling | Tailwind CSS 4 |
| UI | Shadcn/UI (Base UI primitives) |
| Icons | Lucide React |
| Toast | Sonner |
| Language | TypeScript 5.9 (strict) |

### DevOps
| Layer | Technology |
|---|---|
| Monorepo | pnpm workspaces |
| Container | docker-compose (Postgres + Redis) |
| Process | Node `--watch` (dev), graceful shutdown hooks |

---

## Quick Start

### Requirements
- Node.js 20+
- pnpm 9+
- Docker (for Postgres + Redis)

### Setup
```bash
# 1. Clone the repo
git clone https://github.com/ramazandogna/scrape-and-compare.git
cd scrape-and-compare

# 2. Dependencies
pnpm install

# 3. Infrastructure (Postgres + Redis)
docker compose up -d

# 4. Prepare .env
cp .env.example .env
# Generate JWT_SECRET: openssl rand -hex 32 → put it in .env
# Get GEMINI_API_KEY from https://aistudio.google.com/app/apikey

# 5. Prisma
pnpm --filter @scrape/database generate
pnpm --filter @scrape/database migrate

# 6. Playwright browser
pnpm exec playwright install chromium

# 7. Run
pnpm dev:all
# → Backend: http://localhost:3000/api
# → Web:     http://localhost:3001
```

On first launch you'll land on `/sign-in` → sign up → fill in your profile →
enter keyword + location on the dashboard → Scan → when it finishes, AI scoring
starts automatically.

---

## Project Structure

```
scrape-and-compare/
├── apps/
│   ├── backend/                    # NestJS API + workers
│   │   ├── src/
│   │   │   ├── modules/
│   │   │   │   ├── auth/           # signup/login/forgot/reset
│   │   │   │   ├── users/          # profile CRUD
│   │   │   │   ├── jobs/           # job list + delete (owner)
│   │   │   │   ├── matcher/        # AI scoring queue + Gemini
│   │   │   │   └── scraper/        # Playwright + helpers/
│   │   │   ├── extractors/         # skill + salary parsing
│   │   │   ├── pipes/              # ZodValidationPipe
│   │   │   ├── filters/            # global exception filter
│   │   │   └── utils/              # logger, helpers
│   │   └── prisma.service.ts
│   └── web/                        # Next.js 15 frontend
│       └── src/
│           ├── app/                # route segments
│           ├── components/         # dashboard/, auth/, layout/, ...
│           ├── contexts/           # auth, theme
│           ├── hooks/              # useJobs, useScoring, ...
│           └── lib/                # api fetch wrapper, helpers
├── packages/
│   ├── database/                   # Prisma schema + migrations
│   └── shared/                     # Zod schemas + TS types
├── assets/                         # README screenshots + demo video
├── docker-compose.yml              # Postgres + Redis
└── pnpm-workspace.yaml
```

---

## Roadmap

### ✅ Done
- Monorepo (pnpm workspaces) + shared types/schemas
- Modular NestJS backend (5 modules)
- LinkedIn scraper: stealth, paginated, adaptive backoff, resource blocking
- Gemini batch scoring + fallback chain + queue rate limit
- Auth: signup/login/logout/forgot/reset/me (JWT + httpOnly cookie)
- Frontend: 9 pages, dark mode + brand accent toggle
- DB: Prisma + 6 migrations + ownership constraints
- E2E auth test suite (10 scenarios verified)

### 🚧 Next (before deploy)
- **Mail service** (Resend / SES) — so forgot-password can send real emails
- **Production deploy** (Vercel + Railway/Render)
- **Domain + SSL** (Cloudflare DNS)
- **Sentry** — error monitoring
- **GEMINI_API_KEY rotation** + secret manager

### 💡 Post-beta
- CV PDF parsing + automatic skill extraction
- Indeed, Glassdoor, HackerNews Jobs integration
- Match feedback (👍/👎) → scoring prompt tuning
- Automatic periodic scans (cron)
- Email digest — weekly summary of high-scoring listings
- Premium tier: Stripe + Webhook + plan-based limits

---

## Legal Disclaimer

This project is a **personal research effort for educational purposes**. It
scrapes LinkedIn's public search results; it does not log into any account or
access private data.

It is the **end user's responsibility** to review the target platform's **Terms
of Service** and use the tool in compliance with them. The project owners cannot
be held responsible for ToS violations.

---

## License

[MIT](./LICENSE) — clone, fork, and build on it freely.

---

<div align="center">

**For feedback or suggestions:** [doganrmzn40@gmail.com](mailto:doganrmzn40@gmail.com)

[GitHub](https://github.com/ramazandogna) · [LinkedIn](https://www.linkedin.com/in/ramazandogna/)

</div>
