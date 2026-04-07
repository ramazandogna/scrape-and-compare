"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef } from "react";
import { toast } from "sonner";
import { Loader2, Zap, CheckCircle2, AlertCircle, Target } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { useScoring } from "@/hooks/use-scoring";
import type { ScoringProgress } from "@/hooks/use-scoring";

// ═══════════════════════════════════════════
// ScoringButton — AI puanlama tetikleme bileşeni
// ═══════════════════════════════════════════
// 4 state: idle → scoring (progress) → completed → (reset) idle
// Profil sayfası ve/veya dashboard'a konulabilir.

interface ScoringButtonProps {
  userId: string | null;
  /** Scoring tamamlandığında çağrılır — dashboard match'leri yenileyebilsin */
  onComplete?: () => void;
  /** Yeni batch puanlandığında çağrılır (scoredJobs sayısı iletilir) */
  onProgress?: (scoredJobs: number) => void;
}

export function ScoringButton({ userId, onComplete, onProgress }: ScoringButtonProps) {
  const router = useRouter();
  const { status, progress, error, message, triggerScoring, reset } = useScoring();

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
          <Zap className="size-5 text-muted-foreground" />
          <div className="flex-1">
            <p className="text-sm font-medium">AI Puanlama</p>
            <p className="text-xs text-muted-foreground">
              Profil oluşturup ilanları puanlayın
            </p>
          </div>
          <Button disabled size="sm">
            <Target className="size-4" />
            İlanları Puanla
          </Button>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardContent className="space-y-3 py-4">
        <div className="flex items-center gap-3">
          <StatusIcon status={status} />
          <div className="flex-1">
            <p className="text-sm font-medium">AI Puanlama</p>
            <StatusMessage status={status} progress={progress} error={error} message={message} />
          </div>

          {/* Idle → Puanla butonu */}
          {status === "idle" && (
            <Button size="sm" onClick={() => triggerScoring(userId)}>
              <Target className="size-4" />
              İlanları Puanla
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
      return <Zap className="size-5 text-primary" />;
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
          (progress.scoredJobs / progress.totalJobs) * progress.totalBatches
        );
        const remainingBatches = progress.totalBatches - completedBatches;
        const etaSeconds = remainingBatches * 20; // ~20s per batch (rate limit)
        const etaMin = Math.ceil(etaSeconds / 60);
        return (
          <p className="text-xs text-muted-foreground">
            {progress.scoredJobs}/{progress.totalJobs} ilan puanlandı
            {" "}({completedBatches}/{progress.totalBatches} batch)
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
        return (
          <p className="text-xs text-amber-700">
            {message}
          </p>
        );
      }
      return (
        <p className="text-xs text-muted-foreground">
         Gelişmiş AI ile ilanları profilinize göre puanlayın ve en uygun ilanları görün.
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
