"use client";

import { useState, useCallback, useRef, useEffect } from "react";
import { apiFetch, ApiError } from "@/lib/api";
import type { MatchResultDto, PaginatedResponse } from "@/types/job";

// ═══════════════════════════════════════════
// useScoring — AI puanlama tetikleme + polling
// ═══════════════════════════════════════════
//
// State Machine:
//   idle → (trigger) → scoring → (done) → completed
//                    → (error)  → error
//
// F5 Persistence:
//   sessionStorage'da aktif scoring bilgisi tutulur.
//   Sayfa yenilendiğinde mount'ta kontrol edilir, polling devam eder.

// ─────────────────────────────────────────

type ScoringStatus = "idle" | "scoring" | "completed" | "error";

interface ScoreTriggerResponse {
  message: string;
  userId: string;
  totalJobs: number;
  totalBatches: number;
  batchSize: number;
}

interface UseScoringReturn {
  status: ScoringStatus;
  progress: ScoringProgress | null;
  error: string | null;
  message: string | null;
  triggerScoring: (userId: string) => Promise<void>;
  reset: () => void;
}

export interface ScoringProgress {
  totalJobs: number;
  scoredJobs: number;
  totalBatches: number;
  percentage: number;
}

const POLL_INTERVAL_MS = 5_000;
const POLL_TIMEOUT_MS = 10 * 60_000; // 10 dakika max
const SESSION_KEY = "scrape:scoring-active";

/** sessionStorage'a yazılan aktif scoring bilgisi */
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
    // 10 dk'dan eski session'ları geçersiz say
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

  /** Polling'i temizle */
  const stopPolling = useCallback(() => {
    if (pollingRef.current) {
      clearInterval(pollingRef.current);
      pollingRef.current = null;
    }
  }, []);

  /** State'i sıfırla (yeniden puanlama için) */
  const reset = useCallback(() => {
    stopPolling();
    clearScoringSession();
    setStatus("idle");
    setProgress(null);
    setError(null);
    setMessage(null);
  }, [stopPolling]);

  /** Polling başlat — hem triggerScoring hem F5 resume için ortaklaştırıldı */
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
          // Poll hatası → sessizce atla
        }
      }, POLL_INTERVAL_MS);
    },
    [stopPolling]
  );

  /** F5 sonrası: sessionStorage'da aktif scoring varsa polling'i devam ettir */
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

  // Unmount cleanup — polling leak'i önle (HMR, sayfa geçişi)
  useEffect(() => {
    return () => stopPolling();
  }, [stopPolling]);

  /** Puanlamayı tetikle + polling başlat */
  const triggerScoring = useCallback(
    async (userId: string) => {
      // Zaten scoring varsa tekrar tetikleme (F5 koruması)
      if (status === "scoring") return;

      stopPolling();
      setStatus("scoring");
      setError(null);
      setMessage(null);

      try {
        const res = await apiFetch<ScoreTriggerResponse>("/matcher/score", {
          method: "POST",
          body: JSON.stringify({ userId }),
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

        // sessionStorage'a kaydet — F5 sonrasına persist
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
