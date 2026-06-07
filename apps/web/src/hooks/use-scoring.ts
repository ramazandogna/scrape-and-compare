"use client";

import { useState, useCallback, useRef, useEffect } from "react";
import { apiFetch, ApiError } from "@/lib/api";
import type { MatchResultDto, PaginatedResponse } from "@/types/job";

// ═══════════════════════════════════════════
// useScoring — trigger AI scoring + polling
// ═══════════════════════════════════════════
//
// State Machine:
//   idle → (trigger) → scoring → (done) → completed
//                    → (error)  → error
//
// F5 Persistence:
//   Active scoring info is kept in sessionStorage.
//   On page refresh it is checked at mount and polling resumes.

// ─────────────────────────────────────────

type ScoringStatus = "idle" | "scoring" | "completed" | "error";

export type ScoringScope = "all" | "unscored" | "selected";

export type TriggerScoringInput =
  | { scope: "all" }
  | { scope: "unscored" }
  | { scope: "selected"; jobIds: string[] };

interface ScoreTriggerResponse {
  message: string;
  userId: string;
  scope: ScoringScope;
  totalJobs: number;
  totalBatches: number;
  batchSize: number;
}

interface UseScoringReturn {
  status: ScoringStatus;
  progress: ScoringProgress | null;
  error: string | null;
  message: string | null;
  triggerScoring: (userId: string, input: TriggerScoringInput) => Promise<void>;
  reset: () => void;
}

export interface ScoringProgress {
  totalJobs: number;
  scoredJobs: number;
  totalBatches: number;
  percentage: number;
}

const POLL_INTERVAL_MS = 5_000;
const POLL_TIMEOUT_MS = 10 * 60_000; // 10 minutes max
const SESSION_KEY = "scrape:scoring-active";

/** Active scoring info written to sessionStorage */
interface ScoringSession {
  userId: string;
  totalJobs: number;
  totalBatches: number;
  startedAt: number;
}

// ═══════════════════════════════════════════
// SESSION HELPERS
// ═══════════════════════════════════════════

function saveScoringSession(session: ScoringSession): void {
  try { sessionStorage.setItem(SESSION_KEY, JSON.stringify(session)); } catch { /* SSR/private mode */ }
}

function loadScoringSession(): ScoringSession | null {
  try {
    const raw = sessionStorage.getItem(SESSION_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as ScoringSession;
    // Treat sessions older than 10 min as invalid
    if (Date.now() - parsed.startedAt > POLL_TIMEOUT_MS) {
      sessionStorage.removeItem(SESSION_KEY);
      return null;
    }
    return parsed;
  } catch { return null; }
}

function clearScoringSession(): void {
  try { sessionStorage.removeItem(SESSION_KEY); } catch { /* SSR */ }
}

// ═══════════════════════════════════════════
// HOOK
// ═══════════════════════════════════════════

export function useScoring(): UseScoringReturn {
  const [status, setStatus] = useState<ScoringStatus>("idle");
  const [progress, setProgress] = useState<ScoringProgress | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const pollingRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const resumedRef = useRef(false);

  /** Clear polling */
  const stopPolling = useCallback(() => {
    if (pollingRef.current) {
      clearInterval(pollingRef.current);
      pollingRef.current = null;
    }
  }, []);

  /** Reset state (for re-scoring) */
  const reset = useCallback(() => {
    stopPolling();
    clearScoringSession();
    setStatus("idle");
    setProgress(null);
    setError(null);
    setMessage(null);
  }, [stopPolling]);

  /** Start polling — shared between triggerScoring and F5 resume */
  const startPolling = useCallback(
    (userId: string, totalJobs: number, totalBatches: number, startTime: number) => {
      stopPolling();
      setStatus("scoring");

      pollingRef.current = setInterval(async () => {
        if (Date.now() - startTime > POLL_TIMEOUT_MS) {
          stopPolling();
          clearScoringSession();
          setStatus("error");
          setError("Puanlama zaman aşımına uğradı. Lütfen biraz sonra tekrar deneyin.");
          return;
        }

        try {
          const matchRes = await apiFetch<PaginatedResponse<MatchResultDto>>(
            `/matcher/results/${userId}?limit=1`
          );

          const scoredCount = matchRes.meta.total;
          const pct = totalJobs > 0
            ? Math.round((scoredCount / totalJobs) * 100)
            : 100;

          setProgress({
            totalJobs,
            scoredJobs: scoredCount,
            totalBatches,
            percentage: Math.min(pct, 100),
          });

          if (scoredCount >= totalJobs) {
            stopPolling();
            clearScoringSession();
            setStatus("completed");
          }
        } catch {
          // Poll error → silently skip
        }
      }, POLL_INTERVAL_MS);
    },
    [stopPolling]
  );

  /** After F5: if active scoring exists in sessionStorage, resume polling */
  useEffect(() => {
    if (resumedRef.current) return;
    resumedRef.current = true;

    const session = loadScoringSession();
    if (!session) return;

    setProgress({
      totalJobs: session.totalJobs,
      scoredJobs: 0,
      totalBatches: session.totalBatches,
      percentage: 0,
    });

    startPolling(session.userId, session.totalJobs, session.totalBatches, session.startedAt);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Unmount cleanup — prevent polling leak (HMR, page navigation)
  useEffect(() => {
    return () => stopPolling();
  }, [stopPolling]);

  /** Trigger scoring + start polling */
  const triggerScoring = useCallback(
    async (userId: string, input: TriggerScoringInput) => {
      // Skip trigger if scoring already in progress (F5 guard)
      if (status === "scoring") return;

      stopPolling();
      setStatus("scoring");
      setError(null);
      setMessage(null);

      try {
        const res = await apiFetch<ScoreTriggerResponse>("/matcher/score", {
          method: "POST",
          body: JSON.stringify({ userId, ...input }),
        });

        if (res.totalJobs === 0) {
          stopPolling();
          setStatus("idle");
          setProgress(null);
          setMessage("Puanlanacak ilan yok");
          return;
        }

        const initialProgress: ScoringProgress = {
          totalJobs: res.totalJobs,
          scoredJobs: 0,
          totalBatches: res.totalBatches,
          percentage: 0,
        };
        setProgress(initialProgress);

        // Save to sessionStorage — persist across F5
        const startedAt = Date.now();
        saveScoringSession({
          userId,
          totalJobs: res.totalJobs,
          totalBatches: res.totalBatches,
          startedAt,
        });

        startPolling(userId, res.totalJobs, res.totalBatches, startedAt);
      } catch (err) {
        stopPolling();
        clearScoringSession();
        setStatus("error");
        setError(extractScoringError(err));
      }
    },
    [stopPolling, startPolling, status]
  );

  return { status, progress, error, message, triggerScoring, reset };
}

// ═══════════════════════════════════════════
// HELPERS
// ═══════════════════════════════════════════

function extractScoringError(err: unknown): string {
  if (err instanceof ApiError) {
    if (err.status === 429) return "Rate limit aşıldı (429). Lütfen 1-2 dakika sonra tekrar deneyin";
    if (err.status === 404) return "Kullanıcı bulunamadı — önce profil oluşturun";
    if (err.status === 400) return "Geçersiz kullanıcı bilgisi";
    return `Puanlama hatası (${err.status})`;
  }
  return "Bağlantı hatası — backend çalışıyor mu?";
}
