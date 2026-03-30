/**
 * Jobs Module — İş ilanları okuma modülü.
 *
 * Bu modül sadece READ operasyonları sunar:
 *   - GET /api/jobs → liste (paginated, filtrelenebilir)
 *
 * Neden Scraper modülünden ayrı?
 *   - ScraperModule → WRITE: veri topla, DB'ye yaz
 *   - JobsModule    → READ:  veriyi sorgula, frontend'e sun
 *   - SRP: Her modül tek bir sorumluluk
 *
 * PrismaService'e erişim nasıl sağlanır?
 *   DatabaseModule @Global() olarak işaretli.
 *   Global modüller TÜM modüllerde otomatik erişilebilir.
 *   JobsModule'ün DatabaseModule'ü import etmesine gerek yok.
 */

import { Module } from '@nestjs/common';
import { JobsController } from './jobs.controller';
import { JobsService } from './jobs.service';

@Module({
  controllers: [JobsController],
  providers: [JobsService],
})
export class JobsModule {}
