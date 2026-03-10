/**
 * Prisma Service — NestJS lifecycle ile Prisma Client'ı yönetir.
 *
 * Neden PrismaClient'ı wrap ediyoruz?
 *
 * 1. Lifecycle Management:
 *    - onModuleInit → DB'ye bağlan ($connect)
 *    - onModuleDestroy → Bağlantıyı kapat ($disconnect)
 *    NestJS app.close() çağrıldığında bağlantı otomatik temizlenir.
 *
 * 2. Single Instance:
 *    NestJS DI sayesinde tüm uygulama boyunca TEK bir PrismaClient instance'ı
 *    kullanılır. Connection pool paylaşılır, gereksiz bağlantı açılmaz.
 *
 * 3. Type Safety:
 *    PrismaClient tüm metotlarını (findMany, create, update...) miras alır.
 *    `prismaService.jobListing.findMany(...)` yazabilirsin.
 *
 * Kullanım:
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
   * NestJS modül başlatılırken DB bağlantısı aç.
   * app.close() veya SIGTERM gelene kadar açık kalır.
   */
  async onModuleInit(): Promise<void> {
    await this.$connect();
  }

  /**
   * NestJS modül kapatılırken DB bağlantısını temiz şekilde kapat.
   * Connection pool'daki tüm bağlantılar release edilir.
   */
  async onModuleDestroy(): Promise<void> {
    await this.$disconnect();
  }
}
