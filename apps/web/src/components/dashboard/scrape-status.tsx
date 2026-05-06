"use client";

import { Loader2, CheckCircle, AlertCircle, Search, Radio } from "lucide-react";
import { cn } from "@/lib/utils";
import type { ScrapeState } from "@/hooks/use-scraper";

// ═══════════════════════════════════════════
// ScrapeStatus — Scrape ilerleme göstergesi
// ═══════════════════════════════════════════
// State Machine UI:
//   idle       → gizli
//   triggering → "Kuyruk ekleniyor..."
//   scraping   → progress bar + faz mesajı
//   completed  → sonuç özeti (X yeni, Y güncellendi)
//   error      → hata mesajı

interface ScrapeStatusProps {
  state: ScrapeState;
  onDismiss?: () => void;
}

export function ScrapeStatus({ state, onDismiss }: ScrapeStatusProps) {
  if (state.phase === "idle") return null;

  return (
    <div
      className={cn(
        "mt-3 flex items-center gap-2 rounded-lg border px-4 py-2.5 text-sm transition-all",
        state.phase === "triggering" && "border-blue-200 bg-blue-50 text-blue-700",
        state.phase === "scraping" && "border-blue-200 bg-blue-50 text-blue-700",
        state.phase === "completed" && "border-green-200 bg-green-50 text-green-700",
        state.phase === "error" && "border-red-200 bg-red-50 text-red-700"
      )}
    >
      <StatusIcon phase={state.phase} />

      <div className="flex-1 min-w-0">
        <StatusMessage state={state} />
        {state.phase === "scraping" && state.progress && (
          <ProgressBar percentage={state.progress.percentage} />
        )}
      </div>

      {(state.phase === "completed" || state.phase === "error") && onDismiss && (
        <button
          onClick={onDismiss}
          className="shrink-0 text-xs underline opacity-70 hover:opacity-100"
        >
          Kapat
        </button>
      )}
    </div>
  );
}

function StatusIcon({ phase }: { phase: ScrapeState["phase"] }) {
  switch (phase) {
    case "triggering":
      return <Loader2 className="size-4 shrink-0 animate-spin" />;
    case "scraping":
      return <Radio className="size-4 shrink-0 animate-pulse" />;
    case "completed":
      return <CheckCircle className="size-4 shrink-0" />;
    case "error":
      return <AlertCircle className="size-4 shrink-0" />;
    default:
      return <Search className="size-4 shrink-0" />;
  }
}

function StatusMessage({ state }: { state: ScrapeState }) {
  switch (state.phase) {
    case "triggering":
      return <p>Scrape işlemi başlatılıyor...</p>;
    case "scraping": {
      const pct = state.progress?.percentage ?? 0;
      return (
        <div>
          <p>
            {state.progress?.message ?? "LinkedIn taranıyor..."}{" "}
            <span className="font-semibold">%{Math.round(pct)}</span>
          </p>
          <p className="text-[11px] opacity-70 mt-0.5">
            Bu işlem arka planda devam eder — sayfadan ayrılabilirsiniz.
          </p>
        </div>
      );
    }
    case "completed":
      if (state.result) {
        const filtered = state.result.filtered ?? 0;
        const target = state.result.targetPerKeyword;
        const hit = state.result.keywordsHitTarget;
        const totalKw = state.result.keywordsTotal;
        const missed = state.result.perKeyword?.filter((k) => !k.targetReached) ?? [];

        return (
          <div className="space-y-1">
            <p>
              Tamamlandı — <strong>{state.result.totalJobs}</strong> ilan bulundu,{" "}
              <strong>{state.result.created}</strong> yeni eklendi,{" "}
              <strong>{state.result.updated}</strong> güncellendi
              {filtered > 0 && (
                <span
                  className="ml-1 text-xs text-amber-600"
                  title="Açıklama veya skill içermeyen düşük kaliteli ilanlar otomatik elendi"
                >
                  · {filtered} eksik ilan elenip kaydetmeden önce temizlendi ✨
                </span>
              )}
              <span className="ml-1 text-xs opacity-60">
                ({(state.result.durationMs / 1000).toFixed(0)}s)
              </span>
            </p>

            {state.result.discoveryMessage && (
              <p
                className={cn(
                  "text-[11px]",
                  state.result.targetReached ? "text-emerald-700" : "text-amber-700",
                )}
              >
                {state.result.discoveryMessage}
              </p>
            )}

            {target > 0 && totalKw > 0 && (
              <p className="text-[11px] opacity-80">
                Hedef: keyword başına {target} yeni ilan · {hit}/{totalKw} keyword
                hedefi tutturdu.
                {missed.length > 0 && (
                  <span className="ml-1">
                    Hedefini tutturamayan:{" "}
                    {missed
                      .map((k) =>
                        k.blocked
                          ? `${k.keyword} (engellendi)`
                          : `${k.keyword} (${k.collected}/${k.target}, ${k.pagesScanned} sayfa)`,
                      )
                      .join(", ")}
                    .{" "}
                    {missed.some((k) => k.blocked)
                      ? "LinkedIn bizi geçici engelledi olabilir, biraz sonra tekrar dene."
                      : "LinkedIn bu keyword için yeterince yeni ilan yayımlamamış."}
                  </span>
                )}
              </p>
            )}
          </div>
        );
      }
      return <p>Scrape tamamlandı</p>;
    case "error":
      return <p>{state.error ?? "Bir hata oluştu"}</p>;
    default:
      return null;
  }
}

function ProgressBar({ percentage }: { percentage: number }) {
  return (
    <div className="mt-1.5 h-1.5 w-full overflow-hidden rounded-full bg-blue-200">
      <div
        className="h-full rounded-full bg-blue-500 transition-all duration-500"
        style={{ width: `${Math.min(percentage, 100)}%` }}
      />
    </div>
  );
}
