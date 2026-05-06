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
  Layers3,
  RefreshCcw,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogCancel,
  AlertDialogAction,
} from "@/components/ui/alert-dialog";
import { useScoring } from "@/hooks/use-scoring";
import type { ScoringProgress, TriggerScoringInput } from "@/hooks/use-scoring";

// ═══════════════════════════════════════════
// ScoringButton — AI puanlama tetikleme bileşeni
// ═══════════════════════════════════════════
// 4 state: idle → scoring (progress) → completed → (reset) idle
// Tümü puanlanmışsa (unscoredCount=0) → onay dialog'u + 5s countdown

interface ScoringButtonProps {
  userId: string | null;
  /** Puanlanmamış ilan sayısı (0 = tümü puanlı) */
  unscoredCount: number;
  favoriteJobIds?: string[];
  /** Scoring tamamlandığında çağrılır — dashboard match'leri yenileyebilsin */
  onComplete?: () => void;
  /** Yeni batch puanlandığında çağrılır (scoredJobs sayısı iletilir) */
  onProgress?: (scoredJobs: number) => void;
}

export function ScoringButton({
  userId,
  unscoredCount,
  favoriteJobIds = [],
  onComplete,
  onProgress,
}: ScoringButtonProps) {
  const router = useRouter();
  const { status, progress, error, message, triggerScoring, reset } =
    useScoring();

  const [showRescore, setShowRescore] = useState(false);
  const allScored = unscoredCount === 0;

  /** Puanla butonuna tıklandığında: tümü puanlıysa onay dialog, değilse doğrudan tetikle */
  function handleScoreClick() {
    if (!userId) return;
    setShowRescore(true);
  }

  async function handleTrigger(input: TriggerScoringInput) {
    if (!userId) return;
    setShowRescore(false);
    await triggerScoring(userId, input);
  }

  function handleDialogClose() {
    setShowRescore(false);
  }

  // ── useRef ile callback'leri sabit tut ──────────────────
  // Neden useRef?
  //   onComplete ve onProgress her render'da yeni fonksiyon referansı olabilir
  //   (parent düz function kullanıyorsa, React Compiler memoize edemeyebilir).
  //   useEffect dependency'sine koyarsan → her render'da effect ateşlenir → sonsuz döngü.
  //   useRef ise: obje referansı ASLA DEĞİŞMEZ, .current her render'da güncellenir.
  //   Böylece effect sadece gerçek veri değişikliğinde (scoredJobs, status) ateşlenir.
  const onCompleteRef = useRef(onComplete);
  const onProgressRef = useRef(onProgress);
  useEffect(() => {
    onCompleteRef.current = onComplete;
    onProgressRef.current = onProgress;
  });

  // ── Callback: scoring tamamlandı → parent'a bildir ──
  useEffect(() => {
    if (status !== "completed") return;
    onCompleteRef.current?.();
    toast.success("Tüm ilanlar puanlandı!");
  }, [status]);

  // ── Callback: yeni batch puanlandı → parent'a bildir ──
  // scoredJobs > 0 kontrolü: deleteMany sonrası ilk 0 değerini yayma
  // Dependency: sadece scoredJobs — onProgress ref olduğu için eklenmez
  const scoredJobs = progress?.scoredJobs ?? 0;
  useEffect(() => {
    if (scoredJobs > 0) onProgressRef.current?.(scoredJobs);
  }, [scoredJobs]);

  // Error toast
  useEffect(() => {
    if (error) toast.error(error);
  }, [error]);

  // Info toast (yeni ilan yok vb.)
  useEffect(() => {
    if (message) toast.info(message);
  }, [message]);

  // Profil yoksa → disabled CTA
  if (!userId) {
    return (
      <Card>
        <CardContent className="flex items-center gap-3 py-4">
          <Sparkles className="size-5 text-muted-foreground" />
          <div className="flex-1">
            <p className="text-sm font-medium">AI Puanlama</p>
            <p className="text-xs text-muted-foreground">
              Profil oluşturup ilanları puanlayın
            </p>
          </div>
          <Button disabled size="sm">
            <Sparkles className="size-4" />
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
            <div className="flex-1">
              <p className="text-sm font-medium">AI Puanlama</p>
              <StatusMessage
                status={status}
                progress={progress}
                error={error}
                message={message}
              />
              {/* Puanlanmamış ilan sayısı — idle'da göster */}
              {status === "idle" && unscoredCount > 0 && (
                <p className="mt-0.5 text-xs italic text-amber-600">
                  Puanlanmamış {unscoredCount} ilan var
                </p>
              )}
              {status === "idle" && favoriteJobIds.length > 0 && (
                <p className="mt-0.5 text-xs text-muted-foreground">
                  {favoriteJobIds.length} favori ilan ayrı puanlanabilir
                </p>
              )}
            </div>

            {/* Idle → Puanla butonu */}
            {status === "idle" && (
              <Button size="sm" onClick={handleScoreClick}>
                <Sparkles className="size-4" />
                {allScored ? "Puanlama Seçenekleri" : "İlanları Puanla"}
              </Button>
            )}

            {/* Scoring → Loading spinner */}
            {status === "scoring" && (
              <Button size="sm" disabled>
                <Loader2 className="size-4 animate-spin" />
                Puanlanıyor...
              </Button>
            )}

            {/* Completed → Sonuçları gör + dashboard'da kal */}
            {status === "completed" && (
              <Button
                size="sm"
                variant="secondary"
                onClick={() => router.push("/matches")}
              >
                Eşleşmelere Git →
              </Button>
            )}

            {/* Error → Tekrar dene */}
            {status === "error" && (
              <Button size="sm" variant="destructive" onClick={reset}>
                Tekrar Dene
              </Button>
            )}
          </div>

          {/* Progress bar — sadece scoring sırasında */}
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
        <AlertDialogContent className="max-w-xl">
          <AlertDialogHeader>
            <AlertDialogTitle>Puanlama Kapsamını Seç</AlertDialogTitle>
            <AlertDialogDescription>
              Aynı kullanıcı için farklı kapsamlar farklı hız ve token maliyeti
              üretir. Hız istiyorsan sadece gerekli slice&apos;ı puanla.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="grid gap-3">
            <ScopeCard
              title="Sadece puanlanmamış ilanlar"
              description={
                unscoredCount > 0
                  ? `${unscoredCount} ilan için en hızlı ve en ucuz akış.`
                  : "Şu anda puanlanmamış ilan yok."
              }
              icon={<Sparkles className="size-4" />}
              disabled={unscoredCount === 0}
              cta="Hızlı puanla"
              onSelect={() => {
                void handleTrigger({ scope: "unscored" });
              }}
            />
            <ScopeCard
              title="Tüm ilanları yeniden puanla"
              description="Mevcut skorları temizleyip tüm ilanları güncel profile göre yeniden hesaplar. En yüksek maliyetli seçenek budur."
              icon={<RefreshCcw className="size-4" />}
              cta="Hepsini yeniden puanla"
              onSelect={() => {
                void handleTrigger({ scope: "all" });
              }}
            />
            <ScopeCard
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
          <AlertDialogFooter>
            <AlertDialogCancel onClick={handleDialogClose}>
              Vazgeç
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                void handleTrigger({ scope: allScored ? "all" : "unscored" });
              }}
            >
              <Layers3 className="size-4" />
              Varsayılanı Çalıştır
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

function ScopeCard({
  title,
  description,
  icon,
  cta,
  disabled = false,
  onSelect,
}: {
  title: string;
  description: string;
  icon: ReactNode;
  cta: string;
  disabled?: boolean;
  onSelect: () => void;
}) {
  return (
    <div className="rounded-xl border bg-muted/30 p-3">
      <div className="flex items-start justify-between gap-3">
        <div className="space-y-1">
          <p className="flex items-center gap-2 text-sm font-semibold">
            {icon}
            {title}
          </p>
          <p className="text-xs leading-relaxed text-muted-foreground">
            {description}
          </p>
        </div>
        <Button
          size="sm"
          variant={disabled ? "outline" : "default"}
          disabled={disabled}
          className="cursor-pointer"
          onClick={onSelect}
        >
          {cta}
        </Button>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════
// Sub-components
// ═══════════════════════════════════════════

function StatusIcon({ status }: { status: string }) {
  switch (status) {
    case "scoring":
      return <Loader2 className="size-5 animate-spin text-primary" />;
    case "completed":
      return <CheckCircle2 className="size-5 text-green-600" />;
    case "error":
      return <AlertCircle className="size-5 text-destructive" />;
    default:
      return <Sparkles className="size-5 text-primary" />;
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
        const etaSeconds = remainingBatches * 20; // ~20s per batch (rate limit)
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
        <p className="text-xs text-green-600">
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
          Gelişmiş AI ile ilanları profilinize göre puanlayın ve en uygun
          ilanları görün.
        </p>
      );
  }
}

function ProgressBar({ progress }: { progress: ScoringProgress }) {
  return (
    <div className="space-y-1">
      <div className="h-2 overflow-hidden rounded-full bg-muted">
        <div
          className="h-full rounded-full bg-primary transition-[width] duration-1000 ease-out"
          style={{ width: `${progress.percentage}%` }}
        />
      </div>
      <p className="text-right text-[11px] text-muted-foreground">
        %{progress.percentage}
      </p>
    </div>
  );
}
