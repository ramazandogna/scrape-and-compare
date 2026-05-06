import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { CheckCircle, XCircle } from "lucide-react";
import { useState } from "react";

// ═══════════════════════════════════════════
// MatchSkills — Eşleşen ✅ ve eksik ❌ skill'ler
// ═══════════════════════════════════════════
// Puanlanmış ilanlarda kartın alt kısmında gösterilir.
// Puanlanmamış → CTA mesajı gösterilir.

interface MatchSkillsProps {
  matchedSkills: string[] | null;
  missingSkills: string[] | null;
  maxVisible?: number;
  onAddMissingSkill?: (skill: string) => Promise<boolean>;
}

export function MatchSkills({
  matchedSkills,
  missingSkills,
  maxVisible = 3,
  onAddMissingSkill,
}: MatchSkillsProps) {
  const [addedSkills, setAddedSkills] = useState<string[]>([]);
  const [addingSkill, setAddingSkill] = useState<string | null>(null);

  if (!matchedSkills && !missingSkills) {
    return (
      <p className="text-xs text-muted-foreground italic">
        Profil oluşturup puanlama yapın
      </p>
    );
  }

  const matched = matchedSkills ?? [];
  const missing = (missingSkills ?? []).filter((skill) => !addedSkills.includes(skill));
  const effectiveMatched = [
    ...matched,
    ...addedSkills.filter((skill) => !matched.includes(skill)),
  ];

  const visibleMatched = effectiveMatched.slice(0, maxVisible);
  const visibleMissing = missing.slice(0, maxVisible);
  const hiddenMatched = effectiveMatched.slice(maxVisible);
  const hiddenMissing = missing.slice(maxVisible);
  const hiddenCount = hiddenMatched.length + hiddenMissing.length;

  async function handleAddSkill(skill: string): Promise<void> {
    if (!onAddMissingSkill || addingSkill === skill) return;

    setAddingSkill(skill);
    const added = await onAddMissingSkill(skill);
    if (added) {
      setAddedSkills((prev) => (prev.includes(skill) ? prev : [...prev, skill]));
    }
    setAddingSkill(null);
  }

  return (
    <div className="flex flex-wrap gap-1">
      {visibleMatched.map((s) => (
        <Badge
          key={`m-${s}`}
          variant="default"
          className="gap-1 bg-green-100 text-[11px] text-green-700 hover:bg-green-100"
        >
          <CheckCircle className="size-3" />
          {s}
        </Badge>
      ))}
      {visibleMissing.map((s) => (
        <Button
          key={`x-${s}`}
          type="button"
          size="xs"
          variant="outline"
          className="h-5 gap-1 rounded-4xl px-2 text-[11px] text-muted-foreground"
          title="Bu beceriyi profiline ekle"
          onClick={() => {
            void handleAddSkill(s);
          }}
          disabled={!onAddMissingSkill || addingSkill === s}
        >
          <XCircle className="size-3" />
          {addingSkill === s ? "Ekleniyor..." : s}
        </Button>
      ))}
      {hiddenCount > 0 && (
        <Popover>
          <PopoverTrigger
            nativeButton={false}
            render={
              <Badge variant="outline" className="text-[11px] text-muted-foreground">
                +{hiddenCount} daha
              </Badge>
            }
          />
          <PopoverContent className="w-auto max-w-72 p-3" side="top" align="start">
            <div className="flex flex-wrap gap-1.5">
              {hiddenMatched.map((skill) => (
                <Badge
                  key={`hm-${skill}`}
                  variant="default"
                  className="gap-1 bg-green-100 text-[11px] text-green-700 hover:bg-green-100"
                >
                  <CheckCircle className="size-3" />
                  {skill}
                </Badge>
              ))}
              {hiddenMissing.map((skill) => (
                <Badge
                  key={`hx-${skill}`}
                  variant="outline"
                  className="gap-1 text-[11px] text-muted-foreground"
                >
                  <XCircle className="size-3" />
                  {skill}
                </Badge>
              ))}
            </div>
          </PopoverContent>
        </Popover>
      )}
    </div>
  );
}
