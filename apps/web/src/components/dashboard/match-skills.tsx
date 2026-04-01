import { Badge } from "@/components/ui/badge";
import { CheckCircle, XCircle } from "lucide-react";

// ═══════════════════════════════════════════
// MatchSkills — Eşleşen ✅ ve eksik ❌ skill'ler
// ═══════════════════════════════════════════
// Puanlanmış ilanlarda kartın alt kısmında gösterilir.
// Puanlanmamış → CTA mesajı gösterilir.

interface MatchSkillsProps {
  matchedSkills: string[] | null;
  missingSkills: string[] | null;
  maxVisible?: number;
}

export function MatchSkills({
  matchedSkills,
  missingSkills,
  maxVisible = 3,
}: MatchSkillsProps) {
  if (!matchedSkills && !missingSkills) {
    return (
      <p className="text-xs text-muted-foreground italic">
        Profil oluşturup puanlama yapın
      </p>
    );
  }

  const matched = matchedSkills ?? [];
  const missing = missingSkills ?? [];
  const hiddenCount = Math.max(0, matched.length + missing.length - maxVisible * 2);
  const hiddenSkills = [...matched.slice(maxVisible), ...missing.slice(maxVisible)];

  return (
    <div className="flex flex-wrap gap-1">
      {matched.slice(0, maxVisible).map((s) => (
        <Badge
          key={`m-${s}`}
          variant="default"
          className="gap-1 bg-green-100 text-[11px] text-green-700 hover:bg-green-100"
        >
          <CheckCircle className="size-3" />
          {s}
        </Badge>
      ))}
      {missing.slice(0, maxVisible).map((s) => (
        <Badge
          key={`x-${s}`}
          variant="default"
          className="gap-1 bg-red-50 text-[11px] text-red-600 hover:bg-red-50"
        >
          <XCircle className="size-3" />
          {s}
        </Badge>
      ))}
      {hiddenCount > 0 && (
        <span className="text-[11px] text-muted-foreground" title={hiddenSkills.join(", ")}>
          +{hiddenCount} daha
        </span>
      )}
    </div>
  );
}
