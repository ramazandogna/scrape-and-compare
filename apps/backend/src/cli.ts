/**
 * CLI Entry Point — NestJS Standalone Application.
 *
 * This file replaces the old index.fast.ts but now uses NestJS DI:
 * - ScraperService is injected (browser management, parallel tabs)
 * - PrismaService is injected (write to DB)
 * - NestJS lifecycle hooks run (onModuleInit, onModuleDestroy)
 *
 * Supports two modes:
 *
 * 1. Direct Mode (default):
 *    pnpm scrape
 *    → ScraperService.runFastScrape() is called directly
 *    → No server needed, standalone app opens/closes
 *
 * 2. Queue Mode (--queue flag):
 *    pnpm scrape --queue
 *    → Job is pushed to the BullMQ queue
 *    → Runs asynchronously — the server (main.ts) must run the Worker
 *    → CLI exits immediately, Worker does the work
 *
 * What is a NestJS Standalone App?
 * NestFactory.createApplicationContext() — bootstraps the DI container
 * WITHOUT an HTTP listener. All @Injectable() services are available but no HTTP
 * port is bound. When the script finishes app.close() performs cleanup.
 *
 * Run:
 *   pnpm scrape          → Direct mode
 *   pnpm scrape --queue  → Queue mode
 */

import 'reflect-metadata';
import 'dotenv/config';
import { NestFactory } from '@nestjs/core';
import { getQueueToken } from '@nestjs/bullmq';
import type { Queue } from 'bullmq';
import { AppModule } from '@/app.module';
import { ScraperService } from '@/modules/scraper/scraper.service';
import { loadKeywords, loadLocation } from '@/modules/scraper/helpers';
import type { ScrapeJobData, ScrapeJobResult } from '@scrape/shared';
import { QUEUE_NAMES } from '@scrape/shared';
import { logger } from '@/utils/helpers';

/**
 * Checks the --queue flag in CLI arguments.
 *
 * process.argv structure: ['node', 'cli.ts', ...args]
 * Simple flag check — yargs/commander can be added later.
 */
const isQueueMode = (): boolean => process.argv.includes('--queue');

/**
 * Direct Mode — calls ScraperService directly.
 *
 * Opens browser, scrapes, writes to DB, shuts down.
 * Runs synchronously within the same process.
 */
const runDirect = async (app: Awaited<ReturnType<typeof NestFactory.createApplicationContext>>): Promise<void> => {
  const scraperService = app.get(ScraperService);

  const keywords = loadKeywords();
  const location = loadLocation();

  logger.info('[CLI] Direct mode — scrape başlatılıyor', { keywords, location });
  const result = await scraperService.runFastScrape({ keywords, location });

  logger.success('[CLI] Scrape tamamlandı', {
    totalJobs: result.totalJobs,
    created: result.created,
    updated: result.updated,
    durationMs: result.durationMs,
  });
};

/**
 * Queue Mode — adds the job to the BullMQ queue.
 *
 * What does getQueueToken() do?
 * In the NestJS BullMQ integration every queue is registered in DI with a `BullModule_<name>` token.
 * getQueueToken(QUEUE_NAMES.SCRAPER) produces that token, app.get() returns the Queue instance.
 *
 * The CLI exits immediately — the Worker (running in the main.ts process) handles the job.
 * To see the result: GET /scrape/status/:jobId
 */
const runQueue = async (app: Awaited<ReturnType<typeof NestFactory.createApplicationContext>>): Promise<void> => {
  const queue = app.get<Queue<ScrapeJobData, ScrapeJobResult>>(getQueueToken(QUEUE_NAMES.SCRAPER));

  const keywords = loadKeywords();
  const location = loadLocation();

  logger.info('[CLI] Queue mode — job kuyruğa ekleniyor', { keywords, location });

  const job = await queue.add('scrape', { keywords, location }, {
    removeOnComplete: { count: 100 },
    removeOnFail: { count: 50 },
  });

  logger.success(`[CLI] Job kuyruğa eklendi: ${String(job.id)}`, {
    jobId: job.id,
    hint: `Durumu görmek için: GET /scrape/status/${String(job.id)}`,
  });
};

const run = async (): Promise<void> => {
  // Standalone App — bootstrap the DI container without an HTTP listener
  const app = await NestFactory.createApplicationContext(AppModule, {
    logger: false, // Suppress NestJS's own logs — we use our own logger
  });

  try {
    if (isQueueMode()) {
      await runQueue(app);
    } else {
      await runDirect(app);
    }
  } finally {
    // Cleanup — close browser, release connections
    await app.close();
  }
};

run().catch((err: unknown) => {
  logger.error('Kritik hata — CLI scraper çöktü', {
    error: err instanceof Error ? err.message : 'Unknown error',
    stack: err instanceof Error ? err.stack : undefined,
  });
  process.exit(1);
});
