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
      className={cn(
        "group relative inline-flex cursor-pointer items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-semibold",
        "transition-all duration-200 hover:scale-110 hover:shadow-md hover:brightness-110",
        tier.colors,
        tier.pulse && "animate-pulse hover:animate-none",
        className
      )}
    >
      {showLabel && <span>{tier.label}</span>}
      <span>{score}/100</span>

      {/* Custom Tooltip — title yerine CSS-only */}
      <span
        className="pointer-events-none absolute -top-9 left-1/2 z-50 -translate-x-1/2 whitespace-nowrap rounded-md bg-gray-900 px-2.5 py-1 text-[11px] font-medium text-white opacity-0 shadow-lg transition-opacity duration-200 group-hover:opacity-100"
      >
        {tier.tooltip}
        <span className="absolute -bottom-1 left-1/2 size-2 -translate-x-1/2 rotate-45 bg-gray-900" />
      </span>
    </span>
  );
}
