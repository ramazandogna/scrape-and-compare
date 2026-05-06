"use client";

import { useCallback, useEffect, useState } from "react";

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

export function useFavoriteJobs(userId: string | null): UseFavoriteJobsReturn {
  const [favoriteJobIds, setFavoriteJobIds] = useState<string[]>([]);

  useEffect(() => {
    setFavoriteJobIds(loadFavoriteJobIds(userId));
  }, [userId]);

  useEffect(() => {
    const storageKey = getStorageKey(userId);
    if (!storageKey) return;

    localStorage.setItem(storageKey, JSON.stringify(favoriteJobIds));
  }, [favoriteJobIds, userId]);

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