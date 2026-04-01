"use client";

import { useState, useCallback } from "react";
import { apiFetch } from "@/lib/api";
import type { JobDto, PaginatedResponse } from "@/types/job";

// ═══════════════════════════════════════════
// useJobs — Tüm ilanları çeker (client-side filter için)
// ═══════════════════════════════════════════
// MVP stratejisi: ?limit=100 ile tümünü tek seferde al.
// 32 ilanla bu sorunsuz. 500+ olursa backend pagination'a geçilir.

interface UseJobsReturn {
  jobs: JobDto[];
  total: number;
  isLoading: boolean;
  error: string | null;
  fetchJobs: (search?: string, location?: string) => Promise<void>;
}

export function useJobs(): UseJobsReturn {
  const [jobs, setJobs] = useState<JobDto[]>([]);
  const [total, setTotal] = useState(0);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchJobs = useCallback(
    async (search?: string, location?: string) => {
      setIsLoading(true);
      setError(null);
      try {
        const params = new URLSearchParams({ limit: "100" });
        if (search?.trim()) params.set("search", search.trim());
        if (location?.trim()) params.set("location", location.trim());

        const res = await apiFetch<PaginatedResponse<JobDto>>(
          `/jobs?${params.toString()}`
        );
        setJobs(res.data);
        setTotal(res.meta.total);
      } catch {
        setError("İlanlar yüklenirken hata oluştu");
        setJobs([]);
        setTotal(0);
      } finally {
        setIsLoading(false);
      }
    },
    []
  );

  return { jobs, total, isLoading, error, fetchJobs };
}
