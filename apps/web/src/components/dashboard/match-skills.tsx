import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { CheckCircle, Sparkles, UserPlus, XCircle } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

// ═══════════════════════════════════════════
// MatchSkills — Eşleşen ✅ ve eksik ❌ skill'ler
// ═══════════════════════════════════════════
// Puanlanmış ilanlarda kartın alt kısmında gösterilir.
// Puanlanmamış → CTA mesajı gösterilir.

interface MatchSkillsProps {
  matchedSkills: string[] | null;
  missingSkills: string[] | null;
  addedSkills?: string[];
  maxVisible?: number;
  onAddMissingSkill?: (skill: string) => Promise<boolean>;
  onLocalSkillAdd?: (skill: string) => void;
}

export function MatchSkills({
  matchedSkills,
  missingSkills,
  addedSkills = [],
  maxVisible = 3,
  onAddMissingSkill,
  onLocalSkillAdd,
}: MatchSkillsProps) {
  const [addingSkill, setAddingSkill] = useState<string | null>(null);
  const [pendingSkill, setPendingSkill] = useState<string | null>(null);

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

  function markSkillAsAdded(skill: string): void {
    onLocalSkillAdd?.(skill);
  }

  function openSkillDialog(skill: string): void {
    if (!onAddMissingSkill || addingSkill === skill) return;
    setPendingSkill(skill);
  }

  function handleLocalSkillTest(): void {
    if (!pendingSkill) return;

    markSkillAsAdded(pendingSkill);
    toast.info(`${pendingSkill} bu kart için deneme amaçlı eklendi. Bu davranış ilanların sıralamasına etki etmez.`);
    setPendingSkill(null);
  }

  async function handleProfileSkillAdd(): Promise<void> {
    const skill = pendingSkill;
    if (!onAddMissingSkill || addingSkill === skill) return;
    if (!skill) return;

    setAddingSkill(skill);
    const added = await onAddMissingSkill(skill);
    if (added) {
      markSkillAsAdded(skill);
    }
    setAddingSkill(null);
    setPendingSkill(null);
  }

  function MissingSkillButton({ skill }: { skill: string }) {
    return (
      <Button
        key={`x-${skill}`}
        type="button"
        size="xs"
        variant="outline"
        className="h-6 cursor-pointer gap-1 rounded-full px-2 text-[11px] font-medium text-muted-foreground transition-all duration-150 active:scale-95 hover:border-brand-300 hover:bg-brand-50 hover:text-brand"
        title="Bu beceri için ne yapmak istediğini seç"
        onClick={() => {
          openSkillDialog(skill);
        }}
        disabled={!onAddMissingSkill || addingSkill === skill}
      >
        <XCircle className="size-3" />
        {addingSkill === skill ? "Ekleniyor..." : skill}
      </Button>
    );
  }

  return (
    <>
      <div className="flex flex-wrap gap-1.5">
        {visibleMatched.map((s) => (
          <Badge
            key={`m-${s}`}
            variant="default"
            className="gap-1 bg-emerald-50 px-2 py-0.5 text-[11px] font-medium text-emerald-700 ring-1 ring-emerald-200/60 hover:bg-emerald-50"
          >
            <CheckCircle className="size-3" />
            {s}
          </Badge>
        ))}
        {visibleMissing.map((s) => (
          <MissingSkillButton key={`visible-${s}`} skill={s} />
        ))}
        {hiddenCount > 0 && (
          <Popover>
            <PopoverTrigger
              nativeButton={false}
              render={
                <Badge
                  variant="outline"
                  className="cursor-pointer px-2 py-0.5 text-[11px] text-muted-foreground transition-colors hover:border-brand-300 hover:bg-brand-50 hover:text-brand"
                >
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
                    className="gap-1 bg-emerald-50 px-2 py-0.5 text-[11px] font-medium text-emerald-700 ring-1 ring-emerald-200/60 hover:bg-emerald-50"
                  >
                    <CheckCircle className="size-3" />
                    {skill}
                  </Badge>
                ))}
                {hiddenMissing.map((skill) => (
                  <MissingSkillButton key={`hidden-${skill}`} skill={skill} />
                ))}
              </div>
            </PopoverContent>
          </Popover>
        )}
      </div>

      <AlertDialog open={pendingSkill !== null} onOpenChange={(open) => { if (!open) setPendingSkill(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Beceri ile ne yapmak istiyorsun?</AlertDialogTitle>
            <AlertDialogDescription>
              {pendingSkill
                ? `${pendingSkill} için iki ayrı davranış var: sadece bu kartta deneme yapabilir ya da profiline kalıcı olarak ekleyebilirsin.`
                : "Bir beceri seçildiğinde işlem seçenekleri burada görünür."}
            </AlertDialogDescription>
          </AlertDialogHeader>

          <div className="grid gap-3">
            <button
              type="button"
              onClick={handleLocalSkillTest}
              className="flex cursor-pointer items-start gap-3 rounded-xl border bg-muted/30 p-3 text-left transition-colors hover:border-primary/40 hover:bg-muted/60"
            >
              <Sparkles className="mt-0.5 size-4 text-primary" />
              <span>
                <span className="block text-sm font-semibold">Bu ilanda dene</span>
                <span className="block text-xs text-muted-foreground">
                  Sadece bu kartta beceri eklenmiş gibi gösterilir. Global profil değişmez.
                </span>
              </span>
            </button>

            <button
              type="button"
              onClick={() => {
                void handleProfileSkillAdd();
              }}
              disabled={pendingSkill === null || addingSkill === pendingSkill}
              className="flex cursor-pointer items-start gap-3 rounded-xl border bg-muted/30 p-3 text-left transition-colors hover:border-primary/40 hover:bg-muted/60 disabled:cursor-not-allowed disabled:opacity-60"
            >
              <UserPlus className="mt-0.5 size-4 text-primary" />
              <span>
                <span className="block text-sm font-semibold">Profile ekle</span>
                <span className="block text-xs text-muted-foreground">
                  Beceri kalıcı olarak kullanıcı profiline eklenir. Tam etkisini görmek için yeniden puanlama gerekir.
                </span>
              </span>
            </button>
          </div>

          <AlertDialogFooter>
            <AlertDialogCancel>Vazgeç</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleLocalSkillTest}
            >
              Hızlı dene
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
