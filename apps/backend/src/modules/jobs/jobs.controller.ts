/**
 * Jobs Controller — job listings REST API.
 *
 * Endpoints:
 *   GET    /api/jobs                       — List all listings (paginated, filterable)
 *   DELETE /api/jobs/user/:userId          — Clear all of a user's listings
 *   DELETE /api/jobs/user/:userId/job/:jobId — Remove a single listing from the user
 *
 * This file only handles the HTTP layer:
 *   - Read query/param parameters (validate with Zod)
 *   - Forward to JobsService
 *   - Return the result as JSON
 *
 * Business logic (filtering, pagination, deletion) lives in JobsService.
 */

import {
  Controller,
  Get,
  Delete,
  Param,
  Query,
  HttpCode,
  HttpStatus,
  ForbiddenException,
} from '@nestjs/common';
import { jobsQuerySchema } from '@scrape/shared';
import type { JobsQueryInput } from '@scrape/shared';
import { ZodValidationPipe } from '@/pipes/zod-validation.pipe';
import { JobsService } from './jobs.service';
import type { PaginatedJobs } from './jobs.service';
import { CurrentUser } from '@/modules/auth/current-user.decorator';
import type { AuthenticatedUser } from '@/modules/auth/auth.types';

@Controller('jobs')
export class JobsController {
  constructor(private readonly jobsService: JobsService) {}

  /**
   * GET /api/jobs — List job listings.
   *
   * Query parameters (all optional):
   *   ?page=1       — Page number (default: 1)
   *   ?limit=20     — Records per page (default: 20, max: 100)
   *   ?search=React — Search in title or company
   *   ?location=Istanbul — Filter by location
   *   ?sort=newest  — Ordering: newest (default) or oldest
   *
   * Query parameters pass through Zod via @UsePipes:
   *   - "2" string → coerced to number 2
   *   - page=-1 → 400 Bad Request
   *   - limit=500 → 400 Bad Request (max 100)
   */
  @Get()
  async findAll(
    // Bind the pipe to @Query — method-level @UsePipes would push every parameter
    // (including CurrentUser) through zod and strip the user object;
    // user.id would become undefined and the filter wouldn't apply.
    @Query(new ZodValidationPipe(jobsQuerySchema)) query: JobsQueryInput,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<PaginatedJobs> {
    // userId always comes from current user — frontend body/query is overridden.
    return this.jobsService.findAll({ ...query, userId: user.id });
  }

  /**
   * DELETE /api/jobs/user/:userId — Clear all of the user's listings.
   *
   * Business logic:
   *   1. Delete UserJobListing links (job → user relation)
   *   2. Delete MatchResult rows (scoring results)
   *   3. JobListing rows are NOT deleted — other users may still use them
   *
   * Transaction: both succeed together or neither does.
   */
  @Delete('user/:userId')
  @HttpCode(HttpStatus.OK)
  async removeAllUserJobs(
    @Param('userId') userId: string,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<{ removedJobs: number; removedMatches: number }> {
    ensureOwnership(userId, user.id);
    return this.jobsService.removeAllUserJobs(userId);
  }

  /**
   * DELETE /api/jobs/user/:userId/job/:jobId — Remove a single listing from the user.
   * Only UserJobListing + MatchResult are deleted; JobListing remains.
   */
  @Delete('user/:userId/job/:jobId')
  @HttpCode(HttpStatus.OK)
  async removeUserJob(
    @Param('userId') userId: string,
    @Param('jobId') jobId: string,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<{ removed: boolean }> {
    ensureOwnership(userId, user.id);
    return this.jobsService.removeUserJob(userId, jobId);
  }
}

function ensureOwnership(targetUserId: string, currentUserId: string): void {
  if (targetUserId !== currentUserId) {
    throw new ForbiddenException('Sadece kendi ilanların üzerinde işlem yapabilirsin');
  }
}
