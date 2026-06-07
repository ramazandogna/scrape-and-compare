"use client";

import { useState, useCallback } from "react";
import { apiFetch } from "@/lib/api";
import type { JobDto, PaginatedResponse } from "@/types/job";

// ═══════════════════════════════════════════
// useJobs — fetches all listings (for client-side filtering)
// ═══════════════════════════════════════════
// MVP strategy: pull everything in one shot with ?limit=100.
// Fine for 32 listings. Switch to backend pagination at 500+.

interface UseJobsReturn {
  jobs: JobDto[];
  total: number;
  isLoading: boolean;
  error: string | null;
  fetchJobs: (userId: string, search?: string, location?: string) => Promise<void>;
  clearJobs: () => void;
  removeAllJobs: (userId: string) => Promise<{ removedJobs: number; removedMatches: number }>;
  removeJob: (userId: string, jobId: string) => Promise<boolean>;
}

export function useJobs(): UseJobsReturn {
  const [jobs, setJobs] = useState<JobDto[]>([]);
  const [total, setTotal] = useState(0);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchJobs = useCallback(
    async (userId: string, search?: string, location?: string) => {
      setIsLoading(true);
      setError(null);
      try {
        const params = new URLSearchParams({ limit: "100", userId });
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

  const clearJobs = useCallback(() => {
    setJobs([]);
    setTotal(0);
    setError(null);
  }, []);

  /** Delete all of the user's listings on the backend and clear local state */
  const removeAllJobs = useCallback(
    async (userId: string): Promise<{ removedJobs: number; removedMatches: number }> => {
      const res = await apiFetch<{ removedJobs: number; removedMatches: number }>(
        `/jobs/user/${userId}`,
        { method: "DELETE" }
      );
      setJobs([]);
      setTotal(0);
      return res;
    },
    []
  );

  /** Remove a single listing from the user and update local state */
  const removeJob = useCallback(
    async (userId: string, jobId: string): Promise<boolean> => {
      const res = await apiFetch<{ removed: boolean }>(
        `/jobs/user/${userId}/job/${jobId}`,
        { method: "DELETE" }
      );
      if (res.removed) {
        setJobs((prev) => prev.filter((j) => j.id !== jobId));
        setTotal((prev) => Math.max(0, prev - 1));
      }
      return res.removed;
    },
    []
  );

  return { jobs, total, isLoading, error, fetchJobs, clearJobs, removeAllJobs, removeJob };
}
