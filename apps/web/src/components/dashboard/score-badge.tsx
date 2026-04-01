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

interface BadgeConfig {
  icon: string;
  label: string;
  classes: string;
}

function getBadgeConfig(score: number): BadgeConfig {
  if (score >= 80) {
    return {
      icon: "🔥",
      label: "Yüksek Eşleşme",
      classes: "bg-red-100 text-red-700 border-red-200",
    };
  }
  if (score >= 60) {
    return {
      icon: "✅",
      label: "İyi Eşleşme",
      classes: "bg-green-100 text-green-700 border-green-200",
    };
  }
  return {
    icon: "⚡",
    label: "Orta Eşleşme",
    classes: "bg-yellow-100 text-yellow-700 border-yellow-200",
  };
}

export function ScoreBadge({ score, showLabel = true, className }: ScoreBadgeProps) {
  if (score == null || score < 50) return null;

  const config = getBadgeConfig(score);

  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-semibold",
        config.classes,
        className
      )}
    >
      <span>{config.icon}</span>
      {showLabel && <span>{config.label}</span>}
      <span>{score}/100</span>
    </span>
  );
}
