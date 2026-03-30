/**
 * Jobs Controller — İş ilanları REST API.
 *
 * Endpoint'ler:
 *   GET /api/jobs — Tüm ilanları listele (paginated, filtrelenebilir)
 *
 * Bu dosya sadece HTTP katmanıyla ilgilenir:
 *   - Query parametrelerini al (Zod ile validate et)
 *   - JobsService'e ilet
 *   - Sonucu JSON olarak dön
 *
 * İş mantığı (filtreleme, pagination) JobsService'de yaşar.
 */

import { Controller, Get, Query, UsePipes } from '@nestjs/common';
import { jobsQuerySchema } from '@scrape/shared';
import type { JobsQueryInput } from '@scrape/shared';
import { ZodValidationPipe } from '@/pipes/zod-validation.pipe';
import { JobsService } from './jobs.service';
import type { PaginatedJobs } from './jobs.service';

@Controller('jobs')
export class JobsController {
  constructor(private readonly jobsService: JobsService) {}

  /**
   * GET /api/jobs — İş ilanlarını listele.
   *
   * Query parametreleri (tümü opsiyonel):
   *   ?page=1       — Sayfa numarası (default: 1)
   *   ?limit=20     — Sayfa başına kayıt (default: 20, max: 100)
   *   ?search=React — title veya company'de ara
   *   ?location=Istanbul — lokasyona göre filtrele
   *   ?sort=newest  — sıralama: newest (default) veya oldest
   *
   * @UsePipes ile query parametreleri Zod'dan geçer:
   *   - "2" string → 2 number'a coerce edilir
   *   - page=-1 → 400 Bad Request
   *   - limit=500 → 400 Bad Request (max 100)
   */
  @Get()
  @UsePipes(new ZodValidationPipe(jobsQuerySchema))
  async findAll(@Query() query: JobsQueryInput): Promise<PaginatedJobs> {
    return this.jobsService.findAll(query);
  }
}
