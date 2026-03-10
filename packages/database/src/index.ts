/**
 * @scrape/database — Prisma Client re-export
 *
 * Bu dosya Prisma'nın generate ettiği client'ı dışarıya verir.
 * Kullanım: import { PrismaClient } from '@scrape/database';
 *
 * Neden wrap ediyoruz? Prisma Client'ı doğrudan @prisma/client'tan
 * import etmek yerine bu paketten geçiriyoruz çünkü:
 * 1. Tek import noktası — prisma schema değişince sadece bu paketi rebuild et
 * 2. İleride custom extension'lar veya middleware eklenebilir
 * 3. DB connection config tek yerde yönetilir
 *
 * Neden './generated/prisma'? pnpm strict isolation altında
 * @prisma/client'ın .prisma/client re-export'unu VS Code TS server
 * symlink zincirinden çözemez. Explicit output ile bu sorun ortadan kalkar.
 */

export { PrismaClient } from './generated/prisma';

/**
 * Prisma'nın ürettiği enum tiplerini re-export et.
 * Backend'de Prisma enum'larını doğrudan kullanabilmek için.
 */
export {
  SalaryCurrency,
  SalaryPeriod,
  JobSource,
  ScraperStatus,
} from './generated/prisma';

/**
 * Prisma'nın ürettiği model tiplerini re-export et.
 * Type-safe query yazmak için gerekli.
 */
export type {
  User,
  JobListing,
  MatchResult,
  ScraperAudit,
} from './generated/prisma';
