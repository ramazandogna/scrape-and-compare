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
// useFavoriteJobs — kullanıcı bazlı favori ilan listesi (localStorage)
// ═══════════════════════════════════════════
// Race fix:
//   Eski sürümde "userId değişti → state'i yükle" effect'i ile
//   "state değişti → localStorage'a yaz" effect'i aynı render'da çalışıp
//   yazma effect'i eski state'i yazınca depolanan değeri overwrite ediyordu.
//
// Çözüm:
//   - Lazy useState init ile mount anında sync read
//   - userId değişince ref ile load + skipNextWrite flag
//   - Yazma effect'i flag set ise bir kez atlıyor
//   - Aynı tarayıcı sekmesinde başka tabdan değişiklik olursa storage event ile sync

export function useFavoriteJobs(userId: string | null): UseFavoriteJobsReturn {
  const [favoriteJobIds, setFavoriteJobIds] = useState<string[]>(() =>
    loadFavoriteJobIds(userId),
  );

  const lastUserIdRef = useRef<string | null>(userId);
  const skipNextWriteRef = useRef(false);

  // userId değiştiğinde reload — kullanıcı switch'i (logout + login) için
  useEffect(() => {
    if (lastUserIdRef.current === userId) return;
    lastUserIdRef.current = userId;
    skipNextWriteRef.current = true;
    setFavoriteJobIds(loadFavoriteJobIds(userId));
  }, [userId]);

  // Persist — kullanıcı toggle ettikten sonra her değişikliği yaz
  useEffect(() => {
    if (skipNextWriteRef.current) {
      // load sonrası ilk write'ı atla — yoksa eski state diske yazılır
      skipNextWriteRef.current = false;
      return;
    }
    const storageKey = getStorageKey(userId);
    if (!storageKey) return;
    try {
      localStorage.setItem(storageKey, JSON.stringify(favoriteJobIds));
    } catch {
      // quota / private window — sessizce geç
    }
  }, [favoriteJobIds, userId]);

  // Cross-tab sync — başka sekmedeki toggle bu sekmede görünsün
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
