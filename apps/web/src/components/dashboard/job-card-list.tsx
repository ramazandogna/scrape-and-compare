"use client";

import { JobCard } from "@/components/dashboard/job-card";
import { SortBar } from "@/components/dashboard/sort-bar";
import { Pagination } from "@/components/dashboard/pagination";
import type { EnrichedJob, SortState } from "@/types/job";
import type { PaginationResult } from "@/lib/job-helpers";

// ═══════════════════════════════════════════
// JobCardList — Orta sütun: SortBar + kartlar + pagination
// ═══════════════════════════════════════════

interface JobCardListProps {
  paginatedJobs: PaginationResult<EnrichedJob>;
  sort: SortState;
  onSortChange: (sort: SortState) => void;
  onPageChange: (page: number) => void;
  onRemoveJob?: (jobId: string) => Promise<void>;
}

export function JobCardList({
  paginatedJobs,
  sort,
  onSortChange,
  onPageChange,
  onRemoveJob,
}: JobCardListProps) {
  const { items, page, totalPages, total } = paginatedJobs;

  return (
    <div className="space-y-4">
      <SortBar sort={sort} onSortChange={onSortChange} total={total} />

      {items.length === 0 ? (
        <div className="rounded-xl border border-dashed p-12 text-center">
          <p className="text-muted-foreground">
            Filtrelere uygun ilan bulunamadı
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {items.map((job) => (
            <JobCard key={job.id} job={job} onRemove={onRemoveJob} />
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
