"use client";

import { useState, useCallback } from "react";
import { apiFetch } from "@/lib/api";
import type { MatchResultDto, PaginatedResponse } from "@/types/job";

// ═══════════════════════════════════════════
// useMatchResults — fetches match results for the user
// ═══════════════════════════════════════════
// If no userId (profile not created) → nothing is fetched.
// Match results are merged into JobCards to produce EnrichedJob.

interface UseMatchResultsReturn {
  matches: MatchResultDto[];
  isLoading: boolean;
  error: string | null;
  fetchMatches: (userId: string) => Promise<void>;
}

export function useMatchResults(): UseMatchResultsReturn {
  const [matches, setMatches] = useState<MatchResultDto[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchMatches = useCallback(async (userId: string) => {
    setIsLoading(true);
    setError(null);
    try {
      const res = await apiFetch<PaginatedResponse<MatchResultDto>>(
        `/matcher/results/${userId}?limit=500`
      );
      setMatches(res.data);
    } catch {
      setError("Eşleşme sonuçları yüklenemedi");
      setMatches([]);
    } finally {
      setIsLoading(false);
    }
  }, []);

  return { matches, isLoading, error, fetchMatches };
}
