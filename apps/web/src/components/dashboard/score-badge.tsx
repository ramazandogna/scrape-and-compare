import { cn } from "@/lib/utils";

// ═══════════════════════════════════════════
// ScoreBadge — Match score badge
// ═══════════════════════════════════════════
// 80+ → fuchsia + soft-pulse dot (premium "apply now" feel)
// 60-79 → emerald (calm green, "good match")
// 0-59 → slate (partial fit, low emphasis)
// Unscored → empty slate

interface ScoreBadgeProps {
  score: number | null | undefined;
  showLabel?: boolean;
  className?: string;
}

const MATCH_THRESHOLD = 60;

function getScoreTier(score: number) {
  if (score >= 80)
    return {
      // 80+ "premium" tier — brand gradient (purple default, green via accent toggle)
      colors:
        "border-brand-300 bg-brand-50 text-brand-700 dark:bg-brand-900/30 dark:text-brand-100",
      showDot: true,
      dotClass: "animate-soft-pulse bg-brand-gradient",
      tooltip: "Güçlü profilinle bu ilana şimdi başvur!",
      label: "Çok uygun",
    };
  if (score >= MATCH_THRESHOLD)
    return {
      // 60-79 "good" — fixed emerald (same across themes, semantic meaning)
      colors:
        "border-emerald-300/70 bg-emerald-50 text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-200",
      showDot: true,
      dotClass: "bg-emerald-500",
      tooltip: "Profilin bu ilanın gereksinimlerini karşılıyor",
      label: "İyi eşleşme",
    };
  return {
    colors:
      "border-slate-200 bg-slate-50 text-slate-600 dark:border-slate-700 dark:bg-slate-900/40 dark:text-slate-400",
    showDot: false,
    dotClass: "",
    tooltip: "Eksik beceriler geliştirilerek uygunluk artırılabilir",
    label: "Kısmen uygun",
  };
}

export function ScoreBadge({
  score,
  showLabel = true,
  className,
}: ScoreBadgeProps) {
  const isScored = score != null;

  if (!isScored) {
    return (
      <span
        className={cn(
          "inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-medium",
          "border-slate-200 bg-slate-50 text-slate-500 dark:border-slate-700 dark:bg-slate-900/40 dark:text-slate-400",
          className,
        )}
      >
        {showLabel && <span>Puanlanmadı</span>}
        <span>—</span>
      </span>
    );
  }

  const tier = getScoreTier(score);

  return (
    <span
      className={cn(
        "group relative inline-flex cursor-default items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-semibold",
        "transition-all duration-200 hover:shadow-sm",
        tier.colors,
        className,
      )}
    >
      {tier.showDot && (
        <span className={cn("size-1.5 rounded-full", tier.dotClass)} />
      )}
      {showLabel && <span>{tier.label}</span>}
      <span className="opacity-70">{score}/100</span>

      <span className="pointer-events-none absolute -top-9 left-1/2 z-50 -translate-x-1/2 whitespace-nowrap rounded-md bg-gray-900 px-2.5 py-1 text-[11px] font-medium text-white opacity-0 shadow-lg transition-opacity duration-200 group-hover:opacity-100">
        {tier.tooltip}
        <span className="absolute -bottom-1 left-1/2 size-2 -translate-x-1/2 rotate-45 bg-gray-900" />
      </span>
    </span>
  );
}
