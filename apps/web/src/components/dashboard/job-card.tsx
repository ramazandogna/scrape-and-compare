import { useState } from "react";
import { ExternalLink, MapPin, Clock, Banknote, Calendar, Trash2, Briefcase, Wifi, Heart } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { ScoreBadge } from "@/components/dashboard/score-badge";
import { CompanyAvatar } from "@/components/dashboard/company-avatar";
import { SkillTags } from "@/components/dashboard/skill-tags";
import { MatchSkills } from "@/components/dashboard/match-skills";
import { formatSalary, timeAgo } from "@/lib/job-helpers";
import { cn } from "@/lib/utils";
import type { EnrichedJob } from "@/types/job";

// ═══════════════════════════════════════════
// JobCard — Tek ilan kartı
// ═══════════════════════════════════════════
// ui-example 2.4'teki wireframe'e uygun.
// Puanlanmış ilan: score badge + matched/missing skills
// Puanlanmamış ilan: badge yok + CTA mesajı

interface JobCardProps {
  job: EnrichedJob;
  onRemove?: (jobId: string) => Promise<void>;
  onAddMissingSkill?: (skill: string) => Promise<boolean>;
  isFavorite?: boolean;
  onToggleFavorite?: (jobId: string) => boolean;
}

export function JobCard({
  job,
  onRemove,
  onAddMissingSkill,
  isFavorite = false,
  onToggleFavorite,
}: JobCardProps) {
  const salary = formatSalary(job.salaryMin, job.salaryMax, job.salaryCurrency);
  const posted = timeAgo(job.scrapedAt, job.postedDate);
  const [confirmRemove, setConfirmRemove] = useState(false);
  const [localAddedSkills, setLocalAddedSkills] = useState<string[]>([]);

  const displayScore = computeSimulatedScore(
    job.match?.score ?? null,
    job.match?.matchedSkills ?? [],
    job.match?.missingSkills ?? [],
    localAddedSkills,
  );

  function handleLocalSkillAdd(skill: string): void {
    setLocalAddedSkills((prev) => (prev.includes(skill) ? prev : [...prev, skill]));
  }

  return (
    <Card className="group/card relative overflow-visible border-border/70 transition-all duration-300 ease-out hover:-translate-y-0.5 hover:border-violet-200/70 hover:shadow-md">
      <CardContent className="space-y-3">
        {/* Score Badge — her ilanda eşleşti/eşleşmedi durumu */}
        <div className="flex items-center justify-between">
          <ScoreBadge score={displayScore} />
          <div className="flex items-center gap-2">
            {onToggleFavorite && (
              <button
                type="button"
                onClick={() => onToggleFavorite(job.id)}
                className={cn(
                  "inline-flex cursor-pointer items-center gap-1 rounded-full border px-2.5 py-1 text-xs font-medium transition-colors",
                  isFavorite
                    ? "border-rose-300 bg-rose-50 text-rose-600"
                    : "border-border text-muted-foreground hover:border-rose-300 hover:bg-rose-50/40 hover:text-rose-600",
                )}
                title={isFavorite ? "Favoriden çıkar" : "İlanı favorilere ekle"}
              >
                <Heart className={cn("size-3.5", isFavorite && "fill-current")} />
                {isFavorite ? "Favoride" : "Favoriye Ekle"}
              </button>
            )}
            <span className="inline-flex items-center rounded-md bg-muted/50 px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wider text-muted-foreground/80">
              {job.source}
            </span>
          </div>
        </div>

        {/* Header: Avatar + Job Info */}
        <div className="flex gap-3">
          <CompanyAvatar company={job.company} logoUrl={job.logoUrl} />
          <div className="min-w-0 flex-1">
            <p className="text-xs font-medium text-muted-foreground">{job.company}</p>
            <h3 className="truncate text-[15px] font-semibold leading-snug">
              {job.title}
            </h3>
            <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
              {job.location && (
                <span className="inline-flex items-center gap-1">
                  <MapPin className="size-3" />
                  {job.location}
                </span>
              )}
              {job.seniorityLevel && (
                <span className="inline-flex items-center gap-1">
                  <Briefcase className="size-3" />
                  {job.seniorityLevel}
                </span>
              )}
              {job.employmentType && (
                <span className="inline-flex items-center gap-1">
                  <Clock className="size-3" />
                  {job.employmentType}
                </span>
              )}
              {job.workType && (
                <span className="inline-flex items-center gap-1">
                  <Wifi className="size-3" />
                  {job.workType}
                </span>
              )}
              {salary && (
                <span className="inline-flex items-center gap-1 font-medium text-foreground">
                  <Banknote className="size-3" />
                  {salary}
                </span>
              )}
              {posted && (
                <span className="inline-flex items-center gap-1">
                  <Calendar className="size-3" />
                  {posted}
                </span>
              )}
            </div>
          </div>
        </div>

        {/* Skills */}
        {job.skills.length > 0 && (
          <>
            <Separator />
            <SkillTags skills={job.skills} />
          </>
        )}

        {/* Match Skills (eşleşen/eksik) */}
        <Separator />
        <div className="flex items-end justify-between gap-2">
          <MatchSkills
            matchedSkills={job.match?.matchedSkills ?? null}
            missingSkills={job.match?.missingSkills ?? null}
            addedSkills={localAddedSkills}
            onAddMissingSkill={onAddMissingSkill}
            onLocalSkillAdd={handleLocalSkillAdd}
          />
          <Button
            variant="ghost"
            size="sm"
            nativeButton={false}
            className="shrink-0 cursor-pointer text-xs"
            render={
              <a
                href={job.url}
                target="_blank"
                rel="noopener noreferrer"
              />
            }
          >
            Detay
            <ExternalLink className="size-3" />
          </Button>
        </div>
      </CardContent>

      {/* Sil butonu — kartın sağ kenarında, hover'da belirginleşir.
          confirm state: yumuşak swap (translate + opacity) ile, çat diye değil. */}
      {onRemove && (
        <div className="absolute -right-3 top-1/2 z-10 -translate-y-1/2">
          <div className="relative size-7">
            <button
              onClick={() => setConfirmRemove(true)}
              title="Bu ilanı kaldır"
              className={cn(
                "absolute inset-0 flex cursor-pointer items-center justify-center rounded-full bg-rose-50 text-rose-500 shadow-sm ring-1 ring-rose-200/60 transition-all duration-200 ease-out hover:bg-rose-500 hover:text-white hover:shadow-md active:scale-90",
                confirmRemove
                  ? "pointer-events-none -translate-y-1 scale-90 opacity-0"
                  : "translate-y-0 opacity-0 group-hover/card:opacity-100",
              )}
            >
              <Trash2 className="size-3.5" />
            </button>

            <div
              className={cn(
                "absolute inset-x-0 -top-3 flex flex-col items-center gap-1 transition-all duration-200 ease-out",
                confirmRemove
                  ? "translate-y-0 opacity-100"
                  : "pointer-events-none -translate-y-1 opacity-0",
              )}
            >
              <button
                onClick={() => {
                  onRemove(job.id);
                  setConfirmRemove(false);
                }}
                className="flex size-7 cursor-pointer items-center justify-center rounded-full bg-rose-500 text-white shadow-md ring-1 ring-rose-300 transition-transform duration-200 hover:scale-110 active:scale-95"
                title="Evet, kaldır"
              >
                <Trash2 className="size-3.5" />
              </button>
              <button
                onClick={() => setConfirmRemove(false)}
                className="flex size-7 cursor-pointer items-center justify-center rounded-full bg-white text-muted-foreground shadow-sm ring-1 ring-border transition-transform duration-200 hover:scale-110 active:scale-95"
                title="Vazgeç"
              >
                ✕
              </button>
            </div>
          </div>
        </div>
      )}
    </Card>
  );
}

// ═══════════════════════════════════════════
// HELPERS
// ═══════════════════════════════════════════

/**
 * Geçici olarak eklenen skill'leri hesaba katarak simüle edilmiş skor döner.
 * Formül: (matchedSkills / totalRequired) × 60 + experienceComponent
 * experienceComponent mevcut skor ve skill oranından geri hesaplanır.
 */
function computeSimulatedScore(
  originalScore: number | null,
  matchedSkills: string[],
  missingSkills: string[],
  addedSkills: string[],
): number | null {
  if (originalScore === null) return null;
  if (addedSkills.length === 0) return originalScore;

  const totalRequired = matchedSkills.length + missingSkills.length;
  if (totalRequired === 0) return originalScore;

  const originalSkillScore = (matchedSkills.length / totalRequired) * 60;
  const experienceComponent = originalScore - originalSkillScore;

  const newlyMatched = addedSkills.filter((s) =>
    missingSkills.some((m) => m.toLowerCase() === s.toLowerCase()),
  );
  const newMatchedCount = matchedSkills.length + newlyMatched.length;
  const newSkillScore = (newMatchedCount / totalRequired) * 60;

  return Math.min(100, Math.round(newSkillScore + experienceComponent));
}
