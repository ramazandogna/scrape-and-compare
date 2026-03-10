/**
 * Scraper Module — Ghost Scraper'ın NestJS modülü.
 *
 * Bu modül scraping ile ilgili tüm servisleri barındırır:
 * - ScraperService: Ana orchestrator (CLI'dan çağrılır)
 * - BrowserService: Playwright browser lifecycle yönetimi
 *
 * NestJS Modüler Mimari:
 * Her modül kendi provider'larını (servis) tanımlar ve export eder.
 * Başka modüller bu servisi kullanmak isterse import eder.
 *
 * Örnek: İleride MatcherModule, ScraperModule'u import edecek
 * çünkü yeni scrape tetiklemek isteyebilir.
 */

import { Module } from '@nestjs/common';
import { ScraperService } from '@/scraper/scraper.service';
import { BrowserService } from '@/scraper/browser.service';

@Module({
  providers: [ScraperService, BrowserService],
  exports: [ScraperService],
})
export class ScraperModule {}
