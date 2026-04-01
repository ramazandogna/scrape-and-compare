"use client";

import { useState, useCallback } from "react";
import { apiFetch } from "@/lib/api";
import type { MatchResultDto, PaginatedResponse } from "@/types/job";

// ═══════════════════════════════════════════
// useMatchResults — Kullanıcıya ait match sonuçlarını çeker
// ═══════════════════════════════════════════
// userId yoksa (profil oluşturulmamış) → hiçbir şey çekilmez.
// Match sonuçları JobCard'lara merge edilerek EnrichedJob oluşturulur.

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
        `/matcher/results/${userId}?limit=100`
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
