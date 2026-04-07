"use client";

import { useEffect, useState, useMemo, useRef } from "react";
import { toast } from "sonner";
import { useJobs } from "@/hooks/use-jobs";
import { useMatchResults } from "@/hooks/use-match-results";
import { useScraper } from "@/hooks/use-scraper";
import { useUser } from "@/hooks/use-user";
import { HeroSearch } from "@/components/dashboard/hero-search";
import { FilterSidebar } from "@/components/dashboard/filter-sidebar";
import { JobCardList } from "@/components/dashboard/job-card-list";
import { RightSidebar } from "@/components/dashboard/right-sidebar";
import { ScoringButton } from "@/components/scoring/scoring-button";
import { ScrollToTop } from "@/components/dashboard/scroll-to-top";
import {
  enrichJobsWithMatches,
  applyFilters,
  applySort,
  paginate,
} from "@/lib/job-helpers";
import { INITIAL_FILTERS, INITIAL_SORT } from "@/types/job";
import type { FilterState, SortState } from "@/types/job";

// ═══════════════════════════════════════════
// Dashboard — Ana sayfa (Scrape + Sonuçlar)
// ═══════════════════════════════════════════
// "Tara" → POST /scrape/trigger → polling → tamamlanınca ilanları yenile
// Mevcut ilanlar her zaman gösterilir (kümülatif havuz)

const PAGE_SIZE = 10;

export default function DashboardPage() {
  const { user } = useUser();
  const { jobs, total, fetchJobs, clearJobs, removeJob } = useJobs();
  const { matches, fetchMatches } = useMatchResults();
  const { state: scrapeState, startScrape, reset: resetScrape } = useScraper();

  const [filters, setFilters] = useState<FilterState>(INITIAL_FILTERS);
  const [sort, setSort] = useState<SortState>(INITIAL_SORT);
  const [page, setPage] = useState(1);
  const listTopRef = useRef<HTMLDivElement | null>(null);
  const latestScrapeToastRef = useRef<string | null>(null);

  // User seçildiyse sadece o kullanıcıya ait ilanları çek
  useEffect(() => {
    if (user?.id) {
      fetchJobs(user.id);
      return;
    }

    clearJobs();
  }, [user?.id, fetchJobs, clearJobs]);

  // User varsa match sonuçlarını çek
  useEffect(() => {
    if (user?.id) fetchMatches(user.id);
  }, [user?.id, fetchMatches]);

  // Scrape tamamlanınca kullanıcıya ait ilanları yeniden çek
  useEffect(() => {
    if (scrapeState.phase === "completed" && user?.id) {
      fetchJobs(user.id);

      const auditId = scrapeState.result?.auditId ?? null;
      if (auditId && latestScrapeToastRef.current !== auditId) {
        latestScrapeToastRef.current = auditId;
        toast.success(
          `Tarama tamamlandı: ${scrapeState.result?.totalJobs ?? 0} ilan işlendi, ${scrapeState.result?.created ?? 0} yeni ilan eklendi.`
        );
      }
    }
  }, [scrapeState.phase, scrapeState.result, user?.id, fetchJobs]);

  // Filtre/sort değiştiğinde sayfa 1'e dön
  function handleFilterChange(f: FilterState) {
    setFilters(f);
    setPage(1);
  }

  function handleSortChange(s: SortState) {
    setSort(s);
    setPage(1);
  }

  function handlePageChange(nextPage: number) {
    setPage(nextPage);
    listTopRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  // "Tara" → gerçek scrape tetikle
  function handleSearch(keywords: string[], location: string): void {
    if (!user?.id) return;

    startScrape(keywords, location || "Turkey", user.id);
    setPage(1);
  }

  // ── Scoring Callbacks ──────────────────────────────────
  // ScoringButton her batch tamamlandığında ve scoring bittiğinde bizi bilgilendirir.
  // Biz de match verilerini yenileyerek kartlardaki skorları canlı güncelliyoruz.
  // Bu "reactive data refresh" pattern'i: UI her zaman güncel veriyi yansıtır.

  /** Yeni batch puanlandı → match'leri yenile (skorlar kartlarda canlı güncellenir) */
  function handleScoringProgress(scoredJobs: number) {
    if (scoredJobs > 0 && user?.id) fetchMatches(user.id);
  }

  /** Tüm ilanlar puanlandı → son kez match'leri yenile (tam veri) */
  function handleScoringComplete() {
    if (user?.id) fetchMatches(user.id);
  }

  // Tekil ilan kaldırma
  async function handleRemoveJob(jobId: string) {
    if (!user?.id) return;
    const removed = await removeJob(user.id, jobId);
    if (removed) toast.success("İlan kaldırıldı");
  }

  // Pipeline: enrich → filter → sort → paginate (memoized)
  const enrichedJobs = useMemo(
    () => enrichJobsWithMatches(jobs, matches),
    [jobs, matches]
  );

  const unscoredCount = useMemo(
    () => enrichedJobs.filter((j) => !j.match).length,
    [enrichedJobs]
  );

  const paginatedJobs = useMemo(() => {
    const filtered = applyFilters(enrichedJobs, filters);
    const sorted = applySort(filtered, sort);
    return paginate(sorted, page, PAGE_SIZE);
  }, [enrichedJobs, filters, sort, page]);

  return (
    <div className="mx-auto max-w-7xl overflow-x-clip px-4 py-6 sm:px-6 lg:px-8">
      {/* Hero Search + Scrape Status */}
      <HeroSearch
        onSearch={handleSearch}
        scrapeState={scrapeState}
        onScrapeReset={resetScrape}
        total={total}
      />

      {/* Scoring — profil oluşturulduysa göster */}
      {user && (
        <div className="mt-4">
          <ScoringButton
            userId={user.id}
            unscoredCount={unscoredCount}
            onComplete={handleScoringComplete}
            onProgress={handleScoringProgress}
          />
        </div>
      )}

      {/* 3-Column Grid */}
      <div ref={listTopRef} className="mt-6 grid gap-6 lg:grid-cols-[240px_1fr_280px]">
        {/* Sol: Filtreler */}
        <div className="hidden min-w-0 lg:block">
          <FilterSidebar
            filters={filters}
            onFilterChange={handleFilterChange}
          />
        </div>

        {/* Orta: İlan Kartları */}
        <JobCardList
          paginatedJobs={paginatedJobs}
          sort={sort}
          onSortChange={handleSortChange}
          onPageChange={handlePageChange}
          onRemoveJob={handleRemoveJob}
        />

        {/* Sağ: Sidebar */}
        <div className="hidden min-w-0 lg:block">
          <RightSidebar />
        </div>
      </div>

      <ScrollToTop />
    </div>
  );
}
