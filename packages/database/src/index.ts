/**
 * @scrape/database — Prisma Client re-export
 *
 * This file exposes the Prisma-generated client to consumers.
 * Usage: import { PrismaClient } from '@scrape/database';
 *
 * Why wrap it? Instead of importing Prisma Client directly from
 * @prisma/client, we route through this package because:
 * 1. Single import surface — only rebuild this package when the schema changes
 * 2. Custom extensions or middleware can be added later
 * 3. DB connection config is managed in one place
 *
 * Why './generated/prisma'? Under pnpm strict isolation the VS Code TS
 * server cannot resolve @prisma/client's .prisma/client re-export through
 * the symlink chain. An explicit output path eliminates the issue.
 */

export { PrismaClient } from './generated/prisma';

/**
 * Re-export Prisma-generated enum types.
 * Lets the backend consume Prisma enums directly.
 */
export {
  SalaryCurrency,
  SalaryPeriod,
  JobSource,
  ScraperStatus,
} from './generated/prisma';

/**
 * Prisma namespace re-export — for input/output types.
 * Usage: import { Prisma } from '@scrape/database';
 *        type CreateInput = Prisma.JobListingCreateInput;
 */
export { Prisma } from './generated/prisma';

/**
 * Re-export Prisma-generated model types.
 * Required for writing type-safe queries.
 */
export type {
  User,
  JobListing,
  MatchResult,
  ScraperAudit,
  UserJobListing,
} from './generated/prisma';
