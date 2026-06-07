/**
 * Jobs Module — job listings read module.
 *
 * This module exposes READ operations only:
 *   - GET /api/jobs → list (paginated, filterable)
 *
 * Why separate from the Scraper module?
 *   - ScraperModule → WRITE: collect data, write to DB
 *   - JobsModule    → READ:  query data, serve to frontend
 *   - SRP: each module has a single responsibility
 *
 * How is PrismaService accessible?
 *   DatabaseModule is marked @Global().
 *   Global modules are automatically accessible in EVERY module.
 *   JobsModule does not need to import DatabaseModule.
 */

import { Module } from '@nestjs/common';
import { JobsController } from './jobs.controller';
import { JobsService } from './jobs.service';

@Module({
  controllers: [JobsController],
  providers: [JobsService],
})
export class JobsModule {}
