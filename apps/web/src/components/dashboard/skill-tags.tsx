import { Badge } from "@/components/ui/badge";
import type { ExtractedSkill } from "@/types/job";

// ═══════════════════════════════════════════
// SkillTags — Skill etiketleri (max N göster, geri kalanı +N)
// ═══════════════════════════════════════════
// ui-example: [React] [TypeScript] [Node.js] [+2]
// isMain: true olanlar önce, sonra secondary. Max 4 görünür.

interface SkillTagsProps {
  skills: ExtractedSkill[];
  maxVisible?: number;
}

export function SkillTags({ skills, maxVisible = 4 }: SkillTagsProps) {
  if (!skills.length) return null;

  // isMain olanlar önce
  const sorted = [...skills].sort(
    (a, b) => (b.isMain ? 1 : 0) - (a.isMain ? 1 : 0)
  );

  const visible = sorted.slice(0, maxVisible);
  const remaining = sorted.length - maxVisible;
  const hiddenSkills = sorted.slice(maxVisible).map((skill) => skill.name);

  return (
    <div className="flex flex-wrap gap-1">
      {visible.map((skill) => (
        <Badge
          key={skill.name}
          variant={skill.isMain ? "secondary" : "outline"}
          className="text-[11px]"
        >
          {skill.name}
        </Badge>
      ))}
      {remaining > 0 && (
        <Badge
          variant="outline"
          className="text-[11px] text-muted-foreground"
          title={hiddenSkills.join(", ")}
        >
          +{remaining}
        </Badge>
      )}
    </div>
  );
}
