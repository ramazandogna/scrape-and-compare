"use client";

import { useEffect, useState, useMemo, useRef } from "react";
import { toast } from "sonner";
import { useJobs } from "@/hooks/use-jobs";
import { useMatchResults } from "@/hooks/use-match-results";
import { useScraper } from "@/hooks/use-scraper";
import { useUser } from "@/hooks/use-user";
import { useFavoriteJobs } from "@/hooks/use-favorite-jobs";
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
// Dashboard — Main page (Scrape + Results)
// ═══════════════════════════════════════════
// "Scrape" → POST /scrape/trigger → polling → refresh jobs on completion
// Existing jobs are always shown (cumulative pool)

const PAGE_SIZE = 10;

export default function DashboardPage() {
  const { user, updateUser } = useUser();
  const { jobs, total, fetchJobs, clearJobs, removeJob } = useJobs();
  const { matches, fetchMatches } = useMatchResults();
  const { state: scrapeState, startScrape, reset: resetScrape } = useScraper();
  const { favoriteJobIds, isFavorite, toggleFavorite } = useFavoriteJobs(user?.id ?? null);

  const [filters, setFilters] = useState<FilterState>(INITIAL_FILTERS);
  const [sort, setSort] = useState<SortState>(INITIAL_SORT);
  const [page, setPage] = useState(1);
  const listTopRef = useRef<HTMLDivElement | null>(null);
  const latestScrapeToastRef = useRef<string | null>(null);

  // If a user is selected, fetch only jobs belonging to that user
  useEffect(() => {
    if (user?.id) {
      fetchJobs(user.id);
      return;
    }

    clearJobs();
  }, [user?.id, fetchJobs, clearJobs]);

  // If a user exists, fetch match results
  useEffect(() => {
    if (user?.id) fetchMatches(user.id);
  }, [user?.id, fetchMatches]);

  // When scrape completes, re-fetch the user's jobs
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

  // When filter/sort changes, reset to page 1
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

  // "Scrape" → trigger actual scrape
  function handleSearch(keywords: string[], location: string): void {
    if (!user?.id) return;

    startScrape(keywords, location || "Turkey", user.id);
    setPage(1);
  }

  // ── Scoring Callbacks ──────────────────────────────────
  // ScoringButton notifies us on every completed batch and when scoring finishes.
  // We refresh match data to live-update scores on the cards.
  // This is the "reactive data refresh" pattern: UI always reflects current data.

  /** New batch scored → refresh matches (scores update live on cards) */
  function handleScoringProgress(scoredJobs: number) {
    if (scoredJobs > 0 && user?.id) fetchMatches(user.id);
  }

  /** All jobs scored → refresh matches one final time (full data) */
  function handleScoringComplete() {
    if (user?.id) fetchMatches(user.id);
  }

  // Single job removal
  async function handleRemoveJob(jobId: string) {
    if (!user?.id) return;
    const removed = await removeJob(user.id, jobId);
    if (removed) toast.success("İlan kaldırıldı");
  }

  async function handleAddMissingSkill(skill: string): Promise<boolean> {
    if (!user) return false;

    const normalizedSkill = skill.trim();
    if (!normalizedSkill) return false;

    const hasSkill = user.techStack.some(
      (tech) => tech.toLowerCase() === normalizedSkill.toLowerCase(),
    );
    if (hasSkill) {
      toast.info(`ℹ️ "${normalizedSkill}" zaten profilinde mevcut.`);
      return false;
    }

    const nextTechStack = [...user.techStack, normalizedSkill];
    const updated = await updateUser({ techStack: nextTechStack });

    if (!updated) {
      toast.error("Beceri profile eklenemedi");
      return false;
    }

    toast.success(
      `✅ "${normalizedSkill}" profiline eklendi — diğer ilanlarda kalıcı etki için Dashboard'dan yeniden puanlama başlatabilirsin.`,
      { duration: 8000 },
    );
    return true;
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

      {/* Scoring — shown once a profile exists */}
      {user && (
        <div className="mt-4">
          <ScoringButton
            userId={user.id}
            unscoredCount={unscoredCount}
            favoriteJobIds={favoriteJobIds.filter((jobId) => jobs.some((job) => job.id === jobId))}
            onComplete={handleScoringComplete}
            onProgress={handleScoringProgress}
            // Automatically score new unscored jobs as soon as scrape finishes.
            // auditId changes on every successful scrape → the useEffect inside
            // ScoringButton catches it and starts without a click.
            autoTriggerSignal={
              scrapeState.phase === "completed"
                ? scrapeState.result?.auditId ?? null
                : null
            }
          />
        </div>
      )}

      {/* 3-Column Grid */}
      <div ref={listTopRef} className="mt-6 grid gap-6 lg:grid-cols-[240px_1fr_280px]">
        {/* Left: Filters */}
        <div className="hidden min-w-0 lg:block">
          <FilterSidebar
            filters={filters}
            onFilterChange={handleFilterChange}
          />
        </div>

        {/* Middle: Job Cards */}
        <JobCardList
          paginatedJobs={paginatedJobs}
          sort={sort}
          onSortChange={handleSortChange}
          onPageChange={handlePageChange}
          onRemoveJob={handleRemoveJob}
          onAddMissingSkill={handleAddMissingSkill}
          isFavorite={isFavorite}
          onToggleFavorite={toggleFavorite}
        />

        {/* Right: Sidebar */}
        <div className="hidden min-w-0 lg:block">
          <RightSidebar />
        </div>
      </div>

      <ScrollToTop />
    </div>
  );
}
