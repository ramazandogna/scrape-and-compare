"use client";

import { useState, useCallback, useRef, useEffect } from "react";
import { apiFetch } from "@/lib/api";

// ═══════════════════════════════════════════
// useScraper — Scrape tetikleme + durum takibi
// ═══════════════════════════════════════════
// State Machine: idle → triggering → scraping → completed / error
// POST /scrape/trigger → jobId al → GET /scrape/status/:jobId polling
//
// F5 Persistence:
//   sessionStorage'da aktif scrape jobId tutulur.
//   Mount'ta kontrol edilir, polling devam eder.

// ── Types ──────────────────────────────────

type ScrapePhase = "idle" | "triggering" | "scraping" | "completed" | "error";

interface ScrapeProgress {
  phase: "SCANNING" | "EXTRACTING";
  message: string;
  percentage: number;
}

interface TriggerResponse {
  jobId: string;
  message: string;
}

interface StatusResponse {
  jobId: string;
  state: string;
  progress: ScrapeProgress | null;
  result: ScrapeCompletedResult | null;
  failedReason: string | null;
}

export interface KeywordOutcomeSummary {
  keyword: string;
  collected: number;
  target: number;
  pagesScanned: number;
  targetReached: boolean;
  exhausted: boolean;
  blocked: boolean;
}

interface ScrapeCompletedResult {
  status: "completed";
  targetNewJobs: number;
  targetReached: boolean;
  discoveryMessage: string;
  totalJobs: number;
  filtered: number;
  created: number;
  updated: number;
  failed: number;
  durationMs: number;
  auditId: string;
  targetPerKeyword: number;
  keywordsHitTarget: number;
  keywordsTotal: number;
  perKeyword: KeywordOutcomeSummary[];
}

export interface ScrapeState {
  phase: ScrapePhase;
  progress: ScrapeProgress | null;
  result: ScrapeCompletedResult | null;
  error: string | null;
}

interface UseScraperReturn {
  state: ScrapeState;
  startScrape: (keywords: string[], location: string, userId: string) => Promise<void>;
  reset: () => void;
}

// ── Constants ──────────────────────────────

const POLL_INTERVAL_MS = 2_000;
const POLL_TIMEOUT_MS = 5 * 60_000; // 5 dakika max
const SESSION_KEY = "scrape:scraper-active";

/** sessionStorage'a yazılan aktif scrape bilgisi */
interface ScrapeSession {
  jobId: string;
  startedAt: number;
}

// ── Session Helpers ────────────────────────

function saveScrapeSession(session: ScrapeSession): void {
  try { sessionStorage.setItem(SESSION_KEY, JSON.stringify(session)); } catch { /* SSR/private */ }
}

function loadScrapeSession(): ScrapeSession | null {
  try {
    const raw = sessionStorage.getItem(SESSION_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as ScrapeSession;
    if (Date.now() - parsed.startedAt > POLL_TIMEOUT_MS) {
      sessionStorage.removeItem(SESSION_KEY);
      return null;
    }
    return parsed;
  } catch { return null; }
}

function clearScrapeSession(): void {
  try { sessionStorage.removeItem(SESSION_KEY); } catch { /* SSR */ }
}

// ── Hook ───────────────────────────────────

export function useScraper(): UseScraperReturn {
  const [state, setState] = useState<ScrapeState>({
    phase: "idle",
    progress: null,
    result: null,
    error: null,
  });

  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const resumedRef = useRef(false);

  function cleanup() {
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
  }

  function reset() {
    cleanup();
    clearScrapeSession();
    setState({ phase: "idle", progress: null, result: null, error: null });
  }

  /** F5 sonrası: aktif scrape varsa polling'i devam ettir */
  useEffect(() => {
    if (resumedRef.current) return;
    resumedRef.current = true;

    const session = loadScrapeSession();
    if (!session) return;

    setState((prev) => ({ ...prev, phase: "scraping" }));
    pollJobStatus(session.jobId, session.startedAt);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const startScrape = useCallback(
    async (keywords: string[], location: string, userId: string) => {
      cleanup();
      setState({ phase: "triggering", progress: null, result: null, error: null });

      try {
        // 1) Trigger — kuyruğa ekle
        const { jobId } = await apiFetch<TriggerResponse>("/scrape/trigger", {
          method: "POST",
          body: JSON.stringify({ keywords, location, userId }),
        });

        setState((prev) => ({ ...prev, phase: "scraping" }));

        // sessionStorage'a kaydet — F5 sonrasına persist
        const startedAt = Date.now();
        saveScrapeSession({ jobId, startedAt });

        // 2) Poll — durumu takip et
        await pollJobStatus(jobId, startedAt);
      } catch (err) {
        const message = err instanceof Error ? err.message : "Scrape başlatılamadı";
        setState((prev) => ({ ...prev, phase: "error", error: message }));
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    []
  );

  async function pollJobStatus(jobId: string, startedAt: number): Promise<void> {
    return new Promise<void>((resolve) => {
      intervalRef.current = setInterval(async () => {
        // Timeout kontrolü
        if (Date.now() - startedAt > POLL_TIMEOUT_MS) {
          cleanup();
          clearScrapeSession();
          setState((prev) => ({
            ...prev,
            phase: "error",
            error: "Scrape zaman aşımına uğradı (5 dk)",
          }));
          resolve();
          return;
        }

        try {
          const status = await apiFetch<StatusResponse>(
            `/scrape/status/${jobId}`
          );

          if (status.state === "completed" && status.result) {
            cleanup();
            clearScrapeSession();
            setState({
              phase: "completed",
              progress: null,
              result: status.result,
              error: null,
            });
            resolve();
            return;
          }

          if (status.state === "failed") {
            cleanup();
            clearScrapeSession();
            setState({
              phase: "error",
              progress: null,
              result: null,
              error: status.failedReason ?? "Scrape başarısız oldu",
            });
            resolve();
            return;
          }

          // Devam ediyor — progress güncelle
          if (status.progress) {
            setState((prev) => ({ ...prev, progress: status.progress }));
          }
        } catch {
          // Tek bir poll hatası silently ignore — sonraki dener
        }
      }, POLL_INTERVAL_MS);
    });
  }

  return { state, startScrape, reset };
}
