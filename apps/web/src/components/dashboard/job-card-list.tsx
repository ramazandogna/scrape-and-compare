"use client";

import { JobCard } from "@/components/dashboard/job-card";
import { SortBar } from "@/components/dashboard/sort-bar";
import { Pagination } from "@/components/dashboard/pagination";
import type { EnrichedJob, SortState } from "@/types/job";
import type { PaginationResult } from "@/lib/job-helpers";

// Expose static classes to Tailwind's purge — use a static array instead of
// dynamic template strings.
const STAGGER_CLASSES = [
  "stagger-1",
  "stagger-2",
  "stagger-3",
  "stagger-4",
  "stagger-5",
  "stagger-6",
  "stagger-7",
  "stagger-8",
  "stagger-9",
  "stagger-10",
] as const;

// ═══════════════════════════════════════════
// JobCardList — Middle column: SortBar + cards + pagination
// ═══════════════════════════════════════════

interface JobCardListProps {
  paginatedJobs: PaginationResult<EnrichedJob>;
  sort: SortState;
  onSortChange: (sort: SortState) => void;
  onPageChange: (page: number) => void;
  onRemoveJob?: (jobId: string) => Promise<void>;
  onAddMissingSkill?: (skill: string) => Promise<boolean>;
  isFavorite?: (jobId: string) => boolean;
  onToggleFavorite?: (jobId: string) => boolean;
}

export function JobCardList({
  paginatedJobs,
  sort,
  onSortChange,
  onPageChange,
  onRemoveJob,
  onAddMissingSkill,
  isFavorite,
  onToggleFavorite,
}: JobCardListProps) {
  const { items, page, totalPages, total } = paginatedJobs;

  return (
    <div className="min-w-0 space-y-4">
      <SortBar sort={sort} onSortChange={onSortChange} total={total} />

      {items.length === 0 ? (
        <div className="rounded-xl border border-dashed p-12 text-center">
          <p className="text-muted-foreground">
            Filtrelere uygun ilan bulunamadı
          </p>
        </div>
      ) : (
        // Use page as key — on page change cards remount and re-trigger the
        // staggered enter animation.
        <div key={`p-${page}`} className="space-y-3">
          {items.map((job, idx) => (
            <div
              key={job.id}
              className={`animate-card-in ${STAGGER_CLASSES[Math.min(idx, STAGGER_CLASSES.length - 1)]}`}
            >
              <JobCard
                job={job}
                onRemove={onRemoveJob}
                onAddMissingSkill={onAddMissingSkill}
                isFavorite={isFavorite?.(job.id) ?? false}
                onToggleFavorite={onToggleFavorite}
              />
            </div>
          ))}
        </div>
      )}

      <Pagination
        page={page}
        totalPages={totalPages}
        onPageChange={onPageChange}
      />
    </div>
  );
}
