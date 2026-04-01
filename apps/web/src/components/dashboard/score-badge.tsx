import { cn } from "@/lib/utils";

// ═══════════════════════════════════════════
// ScoreBadge — Eşleşme skoru badge'i
// ═══════════════════════════════════════════
// Score aralığına göre renk + tooltip + pulse

interface ScoreBadgeProps {
  score: number | null | undefined;
  showLabel?: boolean;
  className?: string;
}

const MATCH_THRESHOLD = 50;

/** Score aralığına göre stil + tooltip belirler */
function getScoreTier(score: number) {
  if (score >= 80) return {
    colors: "border-red-400 bg-red-100 text-red-800",
    pulse: true,
    tooltip: "Mutlaka başvur!",
    label: "Eşleşti",
  };
  if (score >= 70) return {
    colors: "border-orange-400 bg-orange-100 text-orange-800",
    pulse: true,
    tooltip: "Başvurmadan geçme",
    label: "Eşleşti",
  };
  if (score >= MATCH_THRESHOLD) return {
    colors: "border-yellow-400 bg-yellow-100 text-yellow-800",
    pulse: true,
    tooltip: "Bir bak istersen",
    label: "Eşleşti",
  };
  return {
    colors: "border-slate-300 bg-slate-100 text-slate-600",
    pulse: false,
    tooltip: "Düşük eşleşme",
    label: "Eşleşmedi",
  };
}

export function ScoreBadge({ score, showLabel = true, className }: ScoreBadgeProps) {
  const isScored = score != null;

  if (!isScored) {
    return (
      <span
        className={cn(
          "inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-semibold",
          "border-slate-300 bg-slate-100 text-slate-700",
          className
        )}
      >
        {showLabel && <span>Puanlanmadı</span>}
        <span>-</span>
      </span>
    );
  }

  const tier = getScoreTier(score);

  return (
    <span
      title={tier.tooltip}
      className={cn(
        "inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-semibold",
        tier.colors,
        tier.pulse && "animate-pulse",
        className
      )}
    >
      {showLabel && <span>{tier.label}</span>}
      <span>{score}/100</span>
    </span>
  );
}
