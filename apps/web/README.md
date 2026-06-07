# @scrape/web — Frontend

Next.js 15 (App Router) dashboard for **Scrape & Compare**, the AI-driven job
matching engine. Built with Tailwind CSS 4, Shadcn/UI and TypeScript.

This package is part of a pnpm monorepo. See the [root README](../../README.md)
for the full architecture, setup and tech stack.

## Development

```bash
# from the repo root
pnpm install
pnpm --filter @scrape/web dev
```

The app runs at [http://localhost:3001](http://localhost:3001) and proxies API
requests to the NestJS backend via `/api` (configurable through
`NEXT_PUBLIC_API_URL` — see `.env.example`).
