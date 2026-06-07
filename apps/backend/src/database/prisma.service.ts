/**
 * Prisma Service — manages the Prisma Client via NestJS lifecycle.
 *
 * Why wrap PrismaClient?
 *
 * 1. Lifecycle Management:
 *    - onModuleInit → connect to the DB ($connect)
 *    - onModuleDestroy → close the connection ($disconnect)
 *    When NestJS app.close() is called the connection is cleaned up automatically.
 *
 * 2. Single Instance:
 *    Thanks to NestJS DI a SINGLE PrismaClient instance is used throughout the
 *    entire application. The connection pool is shared, no extra connections open.
 *
 * 3. Type Safety:
 *    Inherits all PrismaClient methods (findMany, create, update...).
 *    You can write `prismaService.jobListing.findMany(...)`.
 *
 * Usage:
 * ```typescript
 * @Injectable()
 * export class SomeService {
 *   constructor(private readonly prisma: PrismaService) {}
 *
 *   async getJobs() {
 *     return this.prisma.jobListing.findMany();
 *   }
 * }
 * ```
 */

import { Injectable, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { PrismaClient } from '@scrape/database';

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  /**
   * Open the DB connection when the NestJS module starts.
   * Stays open until app.close() or SIGTERM.
   */
  async onModuleInit(): Promise<void> {
    await this.$connect();
  }

  /**
   * Cleanly close the DB connection when the NestJS module shuts down.
   * All connections in the pool are released.
   */
  async onModuleDestroy(): Promise<void> {
    await this.$disconnect();
  }
}
