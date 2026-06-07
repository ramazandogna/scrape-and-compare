/**
 * Database Module — Prisma ORM integration.
 *
 * Declared as a global module — other modules don't need to import it separately.
 * Provides access to PrismaService throughout the application.
 *
 * Why @Global()?
 * PrismaService is used in nearly every module:
 * - ScraperModule → write audit logs, persist jobs
 * - MatcherModule → user profile and match results
 * - ParserModule → store CV data
 *
 * Instead of writing `imports: [DatabaseModule]` everywhere, we declare it
 * global once. NestJS injects it into every module.
 *
 * Note: NestJS docs recommend avoiding global modules, but a DB service is
 * one of the most legitimate use cases for it.
 */

import { Global, Module } from '@nestjs/common';
import { PrismaService } from '@/database/prisma.service';

@Global()
@Module({
  providers: [PrismaService],
  exports: [PrismaService],
})
export class DatabaseModule {}
