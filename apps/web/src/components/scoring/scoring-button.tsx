"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { toast } from "sonner";
import {
  Loader2,
  Sparkles,
  CheckCircle2,
  AlertCircle,
  Heart,
  RefreshCcw,
  SlidersHorizontal,
  Zap,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogDescription,
} from "@/components/ui/alert-dialog";
import { useScoring } from "@/hooks/use-scoring";
import type { ScoringProgress, TriggerScoringInput } from "@/hooks/use-scoring";
import { cn } from "@/lib/utils";

// ═══════════════════════════════════════════
// ScoringButton — AI puanlama tetikleme bileşeni
// ═══════════════════════════════════════════
// State Machine: idle → scoring → completed (veya error)
// allScored ise: "Puanlama Seçenekleri" → modal açar (yeniden puanlama)
// allScored değilse: "İlanları Puanla" → unscored akışını direkt tetikler
//
// autoTriggerSignal: dashboard scrape tamamlandığında bu prop'u değiştirir;
// idle + unscoredCount > 0 ise unscored puanlamayı otomatik kuyruğa atar.

interface ScoringButtonProps {
  userId: string | null;
  /** Puanlanmamış ilan sayısı (0 = tümü puanlı) */
  unscoredCount: number;
  favoriteJobIds?: string[];
  /** Scoring tamamlandığında çağrılır — dashboard match'leri yenileyebilsin */
  onComplete?: () => void;
  /** Yeni batch puanlandığında çağrılır (scoredJobs sayısı iletilir) */
  onProgress?: (scoredJobs: number) => void;
  /** Değiştiğinde idle + unscored ilan varsa otomatik puanlamayı başlatır */
  autoTriggerSignal?: string | null;
}

export function ScoringButton({
  userId,
  unscoredCount,
  favoriteJobIds = [],
  onComplete,
  onProgress,
  autoTriggerSignal,
}: ScoringButtonProps) {
  const router = useRouter();
  const { status, progress, error, message, triggerScoring, reset } =
    useScoring();

  const [showRescore, setShowRescore] = useState(false);
  const allScored = unscoredCount === 0;

  function handleScoreClick() {
    if (!userId) return;
    if (allScored) {
      // Tüm ilanlar puanlıysa yeniden puanlama scope dialog'u
      setShowRescore(true);
      return;
    }
    // Aksi halde direkt unscored akışını başlat — ekstra tıklama yok
    void triggerScoring(userId, { scope: "unscored" });
  }

  async function handleTrigger(input: TriggerScoringInput) {
    if (!userId) return;
    setShowRescore(false);
    await triggerScoring(userId, input);
  }

  function handleDialogClose() {
    setShowRescore(false);
  }

  // ── Callbacks via ref (sonsuz döngü yok) ───────────────
  const onCompleteRef = useRef(onComplete);
  const onProgressRef = useRef(onProgress);
  useEffect(() => {
    onCompleteRef.current = onComplete;
    onProgressRef.current = onProgress;
  });

  useEffect(() => {
    if (status !== "completed") return;
    onCompleteRef.current?.();
    toast.success("Tüm ilanlar puanlandı!");
  }, [status]);

  const scoredJobs = progress?.scoredJobs ?? 0;
  useEffect(() => {
    if (scoredJobs > 0) onProgressRef.current?.(scoredJobs);
  }, [scoredJobs]);

  useEffect(() => {
    if (error) toast.error(error);
  }, [error]);

  useEffect(() => {
    if (message) toast.info(message);
  }, [message]);

  // ── Auto-trigger: scrape tamamlandığında dashboard signal yollar ──
  // userId + unscored ilan varsa + status idle ise direkt başlat.
  // Bilgilendirici toast atıyoruz; modaldan onay almıyoruz çünkü kullanıcı
  // zaten "tara → puanla" akışına girmiş, onay tekrar tıklatma maliyeti.
  const lastAutoSignalRef = useRef<string | null>(null);
  useEffect(() => {
    if (!autoTriggerSignal || !userId) return;
    if (lastAutoSignalRef.current === autoTriggerSignal) return;
    if (status !== "idle") return;
    if (unscoredCount === 0) return;

    lastAutoSignalRef.current = autoTriggerSignal;
    toast.info(`${unscoredCount} yeni ilan AI ile puanlanıyor...`, {
      duration: 4000,
    });
    void triggerScoring(userId, { scope: "unscored" });
  }, [autoTriggerSignal, userId, unscoredCount, status, triggerScoring]);

  // Profil yoksa → disabled CTA
  if (!userId) {
    return (
      <Card>
        <CardContent className="flex items-center gap-3 py-4">
          <SparklesIcon />
          <div className="flex-1">
            <p className="text-sm font-semibold">AI Puanlama</p>
            <p className="text-xs text-muted-foreground">
              Profil oluşturup ilanları puanlayın
            </p>
          </div>
          <Button disabled size="sm">
            İlanları Puanla
          </Button>
        </CardContent>
      </Card>
    );
  }

  return (
    <>
      <Card>
        <CardContent className="space-y-3 py-4">
          <div className="flex items-center gap-3">
            <StatusIcon status={status} />
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold">AI Puanlama</p>
              <StatusMessage
                status={status}
                progress={progress}
                error={error}
                message={message}
              />
              {status === "idle" && unscoredCount > 0 && (
                <p className="mt-0.5 text-xs font-medium text-amber-600">
                  Puanlanmamış {unscoredCount} ilan var
                </p>
              )}
              {status === "idle" && favoriteJobIds.length > 0 && (
                <p className="mt-0.5 text-xs text-muted-foreground">
                  {favoriteJobIds.length} favori ilan ayrı puanlanabilir
                </p>
              )}
            </div>

            {status === "idle" && (
              <Button
                size="sm"
                variant={allScored ? "outline" : "default"}
                onClick={handleScoreClick}
                className="h-9 gap-1.5"
              >
                {allScored ? (
                  <>
                    <SlidersHorizontal className="size-4" />
                    Puanlama Seçenekleri
                  </>
                ) : (
                  <>
                    <Zap className="size-4" />
                    İlanları Puanla
                  </>
                )}
              </Button>
            )}

            {status === "scoring" && (
              <Button size="sm" disabled className="h-9 gap-1.5">
                <Loader2 className="size-4 animate-spin" />
                Puanlanıyor...
              </Button>
            )}

            {status === "completed" && (
              <Button
                size="sm"
                variant="secondary"
                onClick={() => router.push("/matches")}
                className="h-9"
              >
                Eşleşmelere Git →
              </Button>
            )}

            {status === "error" && (
              <Button
                size="sm"
                variant="destructive"
                onClick={reset}
                className="h-9"
              >
                Tekrar Dene
              </Button>
            )}
          </div>

          {status === "scoring" && progress && (
            <ProgressBar progress={progress} />
          )}
        </CardContent>
      </Card>

      <AlertDialog
        open={showRescore}
        onOpenChange={(open) => {
          if (!open) handleDialogClose();
        }}
      >
        <AlertDialogContent className="max-w-2xl gap-0 p-0">
          <div className="space-y-1 border-b bg-gradient-to-br from-violet-50 via-background to-fuchsia-50 px-6 py-5">
            <AlertDialogHeader className="space-y-1.5">
              <AlertDialogTitle className="flex items-center gap-2 text-base">
                <SlidersHorizontal className="size-4 text-violet-600" />
                Puanlama Kapsamını Seç
              </AlertDialogTitle>
              <AlertDialogDescription className="text-xs leading-relaxed">
                Farklı kapsamlar farklı hız ve token maliyeti üretir. Hız
                istiyorsan sadece gerekli slice&apos;ı puanla.
              </AlertDialogDescription>
            </AlertDialogHeader>
          </div>

          <div className="grid gap-2 px-6 py-5">
            <ScopeCard
              accent="emerald"
              title="Sadece puanlanmamış ilanlar"
              description={
                unscoredCount > 0
                  ? `${unscoredCount} ilan için en hızlı ve en ucuz akış.`
                  : "Şu anda puanlanmamış ilan yok."
              }
              icon={<Zap className="size-4" />}
              disabled={unscoredCount === 0}
              cta="Hızlı puanla"
              onSelect={() => {
                void handleTrigger({ scope: "unscored" });
              }}
            />
            <ScopeCard
              accent="violet"
              title="Tüm ilanları yeniden puanla"
              description="Mevcut skorları temizleyip tüm ilanları güncel profile göre yeniden hesaplar. En yüksek maliyetli seçenek budur."
              icon={<RefreshCcw className="size-4" />}
              cta="Hepsini yeniden puanla"
              onSelect={() => {
                void handleTrigger({ scope: "all" });
              }}
            />
            <ScopeCard
              accent="rose"
              title="Sadece favori ilanları puanla"
              description={
                favoriteJobIds.length > 0
                  ? `${favoriteJobIds.length} favori ilan için odaklı ve hızlı puanlama.`
                  : "Önce ilanları favorilere ekle."
              }
              icon={<Heart className="size-4" />}
              disabled={favoriteJobIds.length === 0}
              cta="Favorileri puanla"
              onSelect={() => {
                void handleTrigger({
                  scope: "selected",
                  jobIds: favoriteJobIds,
                });
              }}
            />
          </div>

          <div className="flex items-center justify-end border-t bg-muted/30 px-6 py-3">
            <Button
              variant="ghost"
              size="sm"
              onClick={handleDialogClose}
              className="text-xs"
            >
              Vazgeç
            </Button>
          </div>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

// ═══════════════════════════════════════════
// Sub-components
// ═══════════════════════════════════════════

function SparklesIcon() {
  return (
    <span className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-violet-100 to-fuchsia-100 text-violet-600 ring-1 ring-violet-200/60">
      <Sparkles className="size-4" />
    </span>
  );
}

const ACCENT_STYLES = {
  emerald: {
    border: "hover:border-emerald-300/70",
    iconBg: "bg-emerald-50 text-emerald-700 ring-emerald-200/60",
  },
  violet: {
    border: "hover:border-violet-300/70",
    iconBg: "bg-violet-50 text-violet-700 ring-violet-200/60",
  },
  rose: {
    border: "hover:border-rose-300/70",
    iconBg: "bg-rose-50 text-rose-700 ring-rose-200/60",
  },
} as const;

type ScopeAccent = keyof typeof ACCENT_STYLES;

function ScopeCard({
  title,
  description,
  icon,
  cta,
  disabled = false,
  accent,
  onSelect,
}: {
  title: string;
  description: string;
  icon: ReactNode;
  cta: string;
  disabled?: boolean;
  accent: ScopeAccent;
  onSelect: () => void;
}) {
  const styles = ACCENT_STYLES[accent];
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onSelect}
      className={cn(
        "group/scope flex w-full cursor-pointer flex-col items-start gap-3 rounded-xl border bg-card p-4 text-left transition-all hover:-translate-y-0.5 hover:shadow-sm sm:flex-row sm:items-center sm:gap-4",
        !disabled && styles.border,
        disabled && "cursor-not-allowed opacity-60 hover:translate-y-0 hover:shadow-none",
      )}
    >
      <span
        className={cn(
          "flex size-10 shrink-0 items-center justify-center rounded-xl ring-1 transition-transform group-hover/scope:scale-105",
          styles.iconBg,
        )}
      >
        {icon}
      </span>
      <div className="min-w-0 flex-1 space-y-0.5">
        <p className="text-sm font-semibold leading-snug">{title}</p>
        <p className="text-xs leading-relaxed text-muted-foreground">
          {description}
        </p>
      </div>
      <span
        className={cn(
          "inline-flex h-8 shrink-0 items-center justify-center rounded-md px-3 text-xs font-medium transition-colors",
          disabled
            ? "border border-border text-muted-foreground"
            : "bg-foreground text-background group-hover/scope:bg-foreground/90",
        )}
      >
        {cta}
      </span>
    </button>
  );
}

function StatusIcon({ status }: { status: string }) {
  switch (status) {
    case "scoring":
      return (
        <span className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-violet-50 text-violet-600 ring-1 ring-violet-200/60">
          <Loader2 className="size-4 animate-spin" />
        </span>
      );
    case "completed":
      return (
        <span className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-emerald-50 text-emerald-600 ring-1 ring-emerald-200/60">
          <CheckCircle2 className="size-4" />
        </span>
      );
    case "error":
      return (
        <span className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-destructive/10 text-destructive ring-1 ring-destructive/20">
          <AlertCircle className="size-4" />
        </span>
      );
    default:
      return <SparklesIcon />;
  }
}

function StatusMessage({
  status,
  progress,
  error,
  message,
}: {
  status: string;
  progress: ScoringProgress | null;
  error: string | null;
  message: string | null;
}) {
  switch (status) {
    case "scoring":
      if (progress) {
        const completedBatches = Math.ceil(
          (progress.scoredJobs / progress.totalJobs) * progress.totalBatches,
        );
        const remainingBatches = progress.totalBatches - completedBatches;
        const etaSeconds = remainingBatches * 20;
        const etaMin = Math.ceil(etaSeconds / 60);
        return (
          <p className="text-xs text-muted-foreground">
            {progress.scoredJobs}/{progress.totalJobs} ilan puanlandı (
            {completedBatches}/{progress.totalBatches} batch)
            {" · "}%{progress.percentage}
            {remainingBatches > 0 && (
              <span className="ml-1">· ~{etaMin} dk kaldı</span>
            )}
          </p>
        );
      }
      return (
        <p className="text-xs text-muted-foreground">Kuyruğa ekleniyor...</p>
      );
    case "completed":
      return (
        <p className="text-xs text-emerald-600">
          Tüm ilanlar puanlandı! Sonuçlara yönlendiriliyorsunuz...
        </p>
      );
    case "error":
      return <p className="text-xs text-destructive">{error}</p>;
    default:
      if (message) {
        return <p className="text-xs text-amber-700">{message}</p>;
      }
      return (
        <p className="text-xs text-muted-foreground">
          Profilini ilanlarla eşleştir, en uygun fırsatları yukarı çek.
        </p>
      );
  }
}

function ProgressBar({ progress }: { progress: ScoringProgress }) {
  return (
    <div className="space-y-1">
      <div className="h-1.5 overflow-hidden rounded-full bg-muted">
        <div
          className="h-full rounded-full bg-gradient-to-r from-violet-600 to-fuchsia-500 transition-[width] duration-1000 ease-out"
          style={{ width: `${progress.percentage}%` }}
        />
      </div>
      <p className="text-right text-[11px] text-muted-foreground">
        %{progress.percentage}
      </p>
    </div>
  );
}
