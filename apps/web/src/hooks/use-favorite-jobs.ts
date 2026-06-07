"use client";

import { useCallback, useEffect, useRef, useState } from "react";

interface UseFavoriteJobsReturn {
  favoriteJobIds: string[];
  favoriteCount: number;
  isFavorite: (jobId: string) => boolean;
  toggleFavorite: (jobId: string) => boolean;
}

function getStorageKey(userId: string | null): string | null {
  return userId ? `scrape:favorites:${userId}` : null;
}

function loadFavoriteJobIds(userId: string | null): string[] {
  if (typeof window === "undefined") return [];
  const storageKey = getStorageKey(userId);
  if (!storageKey) return [];

  try {
    const raw = localStorage.getItem(storageKey);
    if (!raw) return [];

    const parsed = JSON.parse(raw) as unknown;
    return Array.isArray(parsed)
      ? parsed.filter((value): value is string => typeof value === "string")
      : [];
  } catch {
    return [];
  }
}

// ═══════════════════════════════════════════
// useFavoriteJobs — per-user favorite job list (localStorage)
// ═══════════════════════════════════════════
// Race fix:
//   In the old version the "userId changed → load state" effect and
//   the "state changed → write to localStorage" effect ran in the same render,
//   and the write effect overwrote the stored value with the old state.
//
// Solution:
//   - Lazy useState init for sync read at mount
//   - On userId change: ref-tracked load + skipNextWrite flag
//   - Write effect skips once if flag is set
//   - Sync via storage event when another tab in the same browser changes it

export function useFavoriteJobs(userId: string | null): UseFavoriteJobsReturn {
  const [favoriteJobIds, setFavoriteJobIds] = useState<string[]>(() =>
    loadFavoriteJobIds(userId),
  );

  const lastUserIdRef = useRef<string | null>(userId);
  const skipNextWriteRef = useRef(false);

  // Reload when userId changes — for user switch (logout + login)
  useEffect(() => {
    if (lastUserIdRef.current === userId) return;
    lastUserIdRef.current = userId;
    skipNextWriteRef.current = true;
    setFavoriteJobIds(loadFavoriteJobIds(userId));
  }, [userId]);

  // Persist — write every change after user toggles
  useEffect(() => {
    if (skipNextWriteRef.current) {
      // Skip first write after load — otherwise old state gets persisted
      skipNextWriteRef.current = false;
      return;
    }
    const storageKey = getStorageKey(userId);
    if (!storageKey) return;
    try {
      localStorage.setItem(storageKey, JSON.stringify(favoriteJobIds));
    } catch {
      // quota / private window — silently skip
    }
  }, [favoriteJobIds, userId]);

  // Cross-tab sync — reflect toggles from other tabs in this tab
  useEffect(() => {
    const storageKey = getStorageKey(userId);
    if (!storageKey) return;
    function onStorage(e: StorageEvent) {
      if (e.key !== storageKey) return;
      skipNextWriteRef.current = true;
      setFavoriteJobIds(loadFavoriteJobIds(userId));
    }
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, [userId]);

  const isFavorite = useCallback(
    (jobId: string) => favoriteJobIds.includes(jobId),
    [favoriteJobIds],
  );

  const toggleFavorite = useCallback((jobId: string) => {
    let nextValue = false;
    setFavoriteJobIds((current) => {
      if (current.includes(jobId)) {
        nextValue = false;
        return current.filter((id) => id !== jobId);
      }
      nextValue = true;
      return [...current, jobId];
    });
    return nextValue;
  }, []);

  return {
    favoriteJobIds,
    favoriteCount: favoriteJobIds.length,
    isFavorite,
    toggleFavorite,
  };
}
