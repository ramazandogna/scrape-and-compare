"use client";

import { useState, useCallback, useRef } from "react";
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
// Akış:
//   1. POST /api/matcher/score { userId }  → 202
//   2. Poll GET /api/matcher/results/:userId (her 5 sn)
//   3. match sayısı == totalJobs → completed
//   4. 2 dakika timeout → otomatik dur

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
const POLL_TIMEOUT_MS = 120_000; // 2 dakika max

// ═══════════════════════════════════════════
// HOOK
// ═══════════════════════════════════════════

export function useScoring(): UseScoringReturn {
  const [status, setStatus] = useState<ScoringStatus>("idle");
  const [progress, setProgress] = useState<ScoringProgress | null>(null);
  const [error, setError] = useState<string | null>(null);
  const pollingRef = useRef<ReturnType<typeof setInterval> | null>(null);

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
    setStatus("idle");
    setProgress(null);
    setError(null);
  }, [stopPolling]);

  /** Puanlamayı tetikle + polling başlat */
  const triggerScoring = useCallback(
    async (userId: string) => {
      stopPolling();
      setStatus("scoring");
      setError(null);

      try {
        // 1. POST → scoring queue'ya ekle
        const res = await apiFetch<ScoreTriggerResponse>("/matcher/score", {
          method: "POST",
          body: JSON.stringify({ userId }),
        });

        const initialProgress: ScoringProgress = {
          totalJobs: res.totalJobs,
          scoredJobs: 0,
          totalBatches: res.totalBatches,
          percentage: 0,
        };
        setProgress(initialProgress);

        // 2. Polling başlat
        const startTime = Date.now();
        pollingRef.current = setInterval(async () => {
          // Timeout kontrolü
          if (Date.now() - startTime > POLL_TIMEOUT_MS) {
            stopPolling();
            setStatus("completed");
            return;
          }

          try {
            const matchRes = await apiFetch<PaginatedResponse<MatchResultDto>>(
              `/matcher/results/${userId}?limit=1`
            );

            const scoredCount = matchRes.meta.total;
            const pct = res.totalJobs > 0
              ? Math.round((scoredCount / res.totalJobs) * 100)
              : 100;

            setProgress({
              totalJobs: res.totalJobs,
              scoredJobs: scoredCount,
              totalBatches: res.totalBatches,
              percentage: Math.min(pct, 100),
            });

            // Tamamlandı mı?
            if (scoredCount >= res.totalJobs) {
              stopPolling();
              setStatus("completed");
            }
          } catch {
            // Poll hatası → sessizce atla (ağ geçici sorun olabilir)
          }
        }, POLL_INTERVAL_MS);
      } catch (err) {
        stopPolling();
        setStatus("error");
        setError(extractScoringError(err));
      }
    },
    [stopPolling]
  );

  return { status, progress, error, triggerScoring, reset };
}

// ═══════════════════════════════════════════
// HELPERS
// ═══════════════════════════════════════════

function extractScoringError(err: unknown): string {
  if (err instanceof ApiError) {
    if (err.status === 404) return "Kullanıcı bulunamadı — önce profil oluşturun";
    if (err.status === 400) return "Geçersiz kullanıcı bilgisi";
    return `Puanlama hatası (${err.status})`;
  }
  return "Bağlantı hatası — backend çalışıyor mu?";
}
