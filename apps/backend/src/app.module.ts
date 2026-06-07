/**
 * App Module — root module of the NestJS application.
 *
 * This module imports all other modules and wires the application together.
 * In NestJS every application has exactly one root module.
 *
 * BullModule.forRoot() → single Redis connection shared by all BullMQ queues.
 * forRoot() pattern: "This config is application-wide, define it once."
 * Same as DatabaseModule being @Global() — no module opens its own connection.
 *
 * REDIS_HOST/REDIS_PORT are read from .env, falling back to localhost:6379.
 */

import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { DatabaseModule } from '@/database/database.module';
import { ScraperModule } from '@/modules/scraper/scraper.module';
import { JobsModule } from '@/modules/jobs/jobs.module';
import { MatcherModule } from '@/modules/matcher/matcher.module';
import { UsersModule } from '@/modules/users/users.module';
import { AuthModule } from '@/modules/auth/auth.module';

@Module({
  imports: [
    DatabaseModule,
    AuthModule,

    /**
     * BullModule.forRoot() — Redis connection configuration.
     *
     * This call defines the shared Redis connection for ALL queues.
     * Every BullModule.registerQueue() reuses this connection.
     * No need to instantiate a separate ioredis — @nestjs/bullmq handles it.
     */
    BullModule.forRoot({
      connection: {
        host: process.env['REDIS_HOST'] ?? 'localhost',
        port: Number(process.env['REDIS_PORT'] ?? 6379),
      },
    }),

    ScraperModule,

    JobsModule,

    MatcherModule,

    UsersModule,
  ],
})
export class AppModule {}
