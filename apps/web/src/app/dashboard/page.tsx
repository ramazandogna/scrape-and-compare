"use client";

import { useEffect, useState, useMemo, useCallback } from "react";
import { useJobs } from "@/hooks/use-jobs";
import { useMatchResults } from "@/hooks/use-match-results";
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
// Dashboard — Ana sayfa
// ═══════════════════════════════════════════
// Veri akışı: fetchJobs + fetchMatches → enrich → filter → sort → paginate

const PAGE_SIZE = 10;

export default function DashboardPage() {
  const { user } = useUser();
  const { jobs, total, isLoading, fetchJobs } = useJobs();
  const { matches, fetchMatches } = useMatchResults();

  const [filters, setFilters] = useState<FilterState>(INITIAL_FILTERS);
  const [sort, setSort] = useState<SortState>(INITIAL_SORT);
  const [page, setPage] = useState(1);

  // İlk yüklemede ilanları çek
  useEffect(() => {
    fetchJobs();
  }, [fetchJobs]);

  // User varsa match sonuçlarını çek
  useEffect(() => {
    if (user?.id) fetchMatches(user.id);
  }, [user?.id, fetchMatches]);

  // Filtre/sort değiştiğinde sayfa 1'e dön
  const handleFilterChange = useCallback((f: FilterState) => {
    setFilters(f);
    setPage(1);
  }, []);

  const handleSortChange = useCallback((s: SortState) => {
    setSort(s);
    setPage(1);
  }, []);

  const handleSearch = useCallback(
    (search: string, location: string) => {
      fetchJobs(search, location);
      setPage(1);
    },
    [fetchJobs]
  );

  // Pipeline: enrich → filter → sort → paginate (memoized)
  const paginatedJobs = useMemo(() => {
    const enriched = enrichJobsWithMatches(jobs, matches);
    const filtered = applyFilters(enriched, filters);
    const sorted = applySort(filtered, sort);
    return paginate(sorted, page, PAGE_SIZE);
  }, [jobs, matches, filters, sort, page]);

  return (
    <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8">
      {/* Hero Search */}
      <HeroSearch onSearch={handleSearch} total={total} isLoading={isLoading} />

      {/* Scoring — profil oluşturulduysa göster */}
      {user && (
        <div className="mt-4">
          <ScoringButton userId={user.id} />
        </div>
      )}

      {/* 3-Column Grid */}
      <div className="mt-6 grid gap-6 lg:grid-cols-[240px_1fr_280px]">
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
          onPageChange={setPage}
        />

        {/* Sağ: Sidebar */}
        <div className="hidden lg:block">
          <RightSidebar />
        </div>
      </div>
    </div>
  );
}
