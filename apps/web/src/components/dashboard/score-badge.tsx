import { cn } from "@/lib/utils";

// ═══════════════════════════════════════════
// ScoreBadge — Eşleşme skoru badge'i
// ═══════════════════════════════════════════
// Score aralığına göre renk + ikon + metin değişir.
// null/undefined score → render etme (puanlanmamış ilan)

interface ScoreBadgeProps {
  score: number | null | undefined;
  showLabel?: boolean;
  className?: string;
}

const MATCH_THRESHOLD = 50;

export function ScoreBadge({ score, showLabel = true, className }: ScoreBadgeProps) {
  const isScored = score != null;
  const statusLabel = isScored
    ? (score >= MATCH_THRESHOLD ? "Eşleşti" : "Eşleşmedi")
    : "Puanlanmadı";
  const scoreText = isScored ? `${score}/100` : "-";

  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-semibold",
        "border-slate-300 bg-slate-100 text-slate-700",
        className
      )}
    >
      {showLabel && <span>{statusLabel}</span>}
      <span>{scoreText}</span>
    </span>
  );
}
