/**
 * Jobs Controller — İş ilanları REST API.
 *
 * Endpoint'ler:
 *   GET    /api/jobs                       — Tüm ilanları listele (paginated, filtrelenebilir)
 *   DELETE /api/jobs/user/:userId          — Kullanıcının tüm ilanlarını temizle
 *   DELETE /api/jobs/user/:userId/job/:jobId — Tek bir ilanı kullanıcıdan kaldır
 *
 * Bu dosya sadece HTTP katmanıyla ilgilenir:
 *   - Query/Param parametrelerini al (Zod ile validate et)
 *   - JobsService'e ilet
 *   - Sonucu JSON olarak dön
 *
 * İş mantığı (filtreleme, pagination, silme) JobsService'de yaşar.
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
  async findAll(
    // Pipe'ı @Query'e bağlıyoruz — method-level @UsePipes tüm parametreleri
    // (CurrentUser dahil) zod'dan geçirmeye çalışırdı ve user objesini siler;
    // sonuç olarak user.id undefined olur ve filtre uygulanmazdı.
    @Query(new ZodValidationPipe(jobsQuerySchema)) query: JobsQueryInput,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<PaginatedJobs> {
    // userId her zaman current user'dan — frontend body/query'den gelirse override edilir.
    return this.jobsService.findAll({ ...query, userId: user.id });
  }

  /**
   * DELETE /api/jobs/user/:userId — Kullanıcının tüm ilanlarını temizle.
   *
   * İş mantığı:
   *   1. UserJobListing bağlantılarını sil (ilan → kullanıcı ilişkisi)
   *   2. MatchResult kayıtlarını sil (puanlama sonuçları)
   *   3. JobListing'ler silinmez — başka kullanıcılar da kullanabilir
   *
   * Transaction: İkisi birden ya başarılı olur ya da hiçbiri olmaz.
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
   * DELETE /api/jobs/user/:userId/job/:jobId — Tekil ilanı kullanıcıdan kaldır.
   * Sadece UserJobListing + MatchResult silinir, JobListing kalır.
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
