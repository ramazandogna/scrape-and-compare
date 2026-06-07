/**
 * Main Entry Point — NestJS HTTP server.
 *
 * This file exposes REST API endpoints:
 * - POST /api/scrape/trigger — enqueue a new scrape job
 * - GET  /api/scrape/status/:jobId — query job status
 * - GET  /api/jobs — list job postings
 *
 * The BullMQ Worker also runs inside this process:
 * - ScraperProcessor automatically starts listening to the Redis queue
 * - ScraperEventListener logs events
 *
 * Two modes:
 *   main.ts → HTTP server + BullMQ Worker (same process)
 *   cli.ts  → One-shot scrape (standalone, no server)
 *
 * Run: pnpm dev (apps/backend)
 */

import 'reflect-metadata';
import 'dotenv/config';
import cookieParser from 'cookie-parser';
import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { AppModule } from '@/app.module';
import { GlobalExceptionFilter } from '@/filters/global-exception.filter';
import { logger } from '@/utils/helpers';

const bootstrap = async (): Promise<void> => {
  const app = await NestFactory.create<NestExpressApplication>(AppModule, {
    logger: false,
  });

  // Global prefix — all routes live under /api
  app.setGlobalPrefix('api');

  // Cookie parser — parses the auth_token cookie into req.cookies
  app.use(cookieParser());

  // CORS — allows the Next.js frontend to call the API (httpOnly cookie credentials)
  app.enableCors({
    origin: process.env['CORS_ORIGIN'] ?? 'http://localhost:3001',
    methods: ['GET', 'POST', 'PATCH', 'DELETE', 'OPTIONS'],
    credentials: true,
  });

  // Global exception filter — consistent error format
  app.useGlobalFilters(new GlobalExceptionFilter());

  const port = process.env['PORT'] ?? 3000;
  await app.listen(port);

  // In --watch mode Node.js restarts the process via SIGTERM.
  // Without enableShutdownHooks the HTTP server does not release the port
  // → next startup fails with EADDRINUSE.
  app.enableShutdownHooks();

  // Node.js 18.2+ — closes all open sockets so the port is released immediately
  const httpServer = app.getHttpServer() as import('http').Server;
  const closeConnections = (): void => {
    if (typeof httpServer.closeAllConnections === 'function') {
      httpServer.closeAllConnections();
    }
  };

  process.once('SIGTERM', async () => {
    closeConnections();
    await app.close();
  });

  process.once('SIGINT', async () => {
    closeConnections();
    await app.close();
    process.exit(0);
  });

  logger.success(`Backend çalışıyor: http://localhost:${String(port)}/api`);
  logger.info('BullMQ Worker aktif — Redis kuyruğu dinleniyor');
};

bootstrap().catch((err: unknown) => {
  logger.error('Backend başlatılamadı', {
    error: err instanceof Error ? err.message : 'Unknown error',
  });
  process.exit(1);
});
