import { Badge } from "@/components/ui/badge";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import type { ExtractedSkill } from "@/types/job";

// ═══════════════════════════════════════════
// SkillTags — Skill etiketleri (max N göster, geri kalanı +N)
// ═══════════════════════════════════════════
// ui-example: [React] [TypeScript] [Node.js] [+2]
// isMain: true olanlar önce, sonra secondary. Max 4 görünür.
// 8+ skill varsa +N badge'ine tıklayınca popover açılır.

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
  const hiddenSkills = sorted.slice(maxVisible);

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
        <Popover>
          <PopoverTrigger
            nativeButton={false}
            className="cursor-pointer"
            render={
              <Badge
                variant="outline"
                className="text-[11px] text-muted-foreground hover:bg-muted"
              >
                +{remaining}
              </Badge>
            }
          />
          <PopoverContent
            className="w-auto max-w-64 p-3"
            side="top"
            align="start"
          >
            <div className="flex flex-wrap gap-1">
              {hiddenSkills.map((skill) => (
                <Badge
                  key={skill.name}
                  variant={skill.isMain ? "secondary" : "outline"}
                  className="text-[11px]"
                >
                  {skill.name}
                </Badge>
              ))}
            </div>
          </PopoverContent>
        </Popover>
      )}
    </div>
  );
}
