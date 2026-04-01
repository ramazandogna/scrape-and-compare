"use client";

import { useEffect, useState, useMemo, useCallback, useRef } from "react";
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
  const { jobs, total, fetchJobs, clearJobs } = useJobs();
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
  const handleFilterChange = useCallback((f: FilterState) => {
    setFilters(f);
    setPage(1);
  }, []);

  const handleSortChange = useCallback((s: SortState) => {
    setSort(s);
    setPage(1);
  }, []);

  const handlePageChange = useCallback((nextPage: number) => {
    setPage(nextPage);
    listTopRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  }, []);

  // "Tara" → gerçek scrape tetikle
  function handleSearch(keywords: string[], location: string): void {
    if (!user?.id) return;

    startScrape(keywords, location || "Turkey", user.id);
    setPage(1);
  }

  // Pipeline: enrich → filter → sort → paginate (memoized)
  const paginatedJobs = useMemo(() => {
    const enriched = enrichJobsWithMatches(jobs, matches);
    const filtered = applyFilters(enriched, filters);
    const sorted = applySort(filtered, sort);
    return paginate(sorted, page, PAGE_SIZE);
  }, [jobs, matches, filters, sort, page]);

  return (
    <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8">
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
          <ScoringButton userId={user.id} />
        </div>
      )}

      {/* 3-Column Grid */}
      <div ref={listTopRef} className="mt-6 grid gap-6 lg:grid-cols-[240px_1fr_280px]">
        {/* Sol: Filtreler */}
        <div className="hidden lg:block">
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
        />

        {/* Sağ: Sidebar */}
        <div className="hidden lg:block">
          <RightSidebar />
        </div>
      </div>
    </div>
  );
}
