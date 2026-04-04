import { useState } from "react";
import { ExternalLink, MapPin, Clock, Banknote, Calendar, Trash2 } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { ScoreBadge } from "@/components/dashboard/score-badge";
import { CompanyAvatar } from "@/components/dashboard/company-avatar";
import { SkillTags } from "@/components/dashboard/skill-tags";
import { MatchSkills } from "@/components/dashboard/match-skills";
import { formatSalary, timeAgo } from "@/lib/job-helpers";
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
}

export function JobCard({ job, onRemove }: JobCardProps) {
  const salary = formatSalary(job.salaryMin, job.salaryMax, job.salaryCurrency);
  const posted = timeAgo(job.scrapedAt, job.postedDate);
  const [confirmRemove, setConfirmRemove] = useState(false);

  return (
    <Card className="relative overflow-visible transition-shadow hover:shadow-md">
      <CardContent className="space-y-3">
        {/* Score Badge — her ilanda eşleşti/eşleşmedi durumu */}
        <div className="flex items-center justify-between">
          <ScoreBadge score={job.match?.score} />
          <span className="text-xs text-muted-foreground">{job.source}</span>
        </div>

        {/* Header: Avatar + Job Info */}
        <div className="flex gap-3">
          <CompanyAvatar company={job.company} />
          <div className="min-w-0 flex-1">
            <p className="text-sm text-muted-foreground">{job.company}</p>
            <h3 className="truncate text-base font-semibold leading-tight">
              {job.title}
            </h3>
            <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs text-muted-foreground">
              {job.location && (
                <span className="inline-flex items-center gap-1">
                  <MapPin className="size-3" />
                  {job.location}
                </span>
              )}
              {job.employmentType && (
                <span className="inline-flex items-center gap-1">
                  <Clock className="size-3" />
                  {job.employmentType}
                </span>
              )}
              {salary && (
                <span className="inline-flex items-center gap-1">
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
          />
          <Button
            variant="ghost"
            size="sm"
            nativeButton={false}
            className="shrink-0 text-xs"
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

      {/* Sil butonu — kartın sağ kenarında, hover'da belirginleşir */}
      {onRemove && (
        <div className="absolute -right-3 top-1/2 z-10 -translate-y-1/2">
          {confirmRemove ? (
            <div className="flex flex-col gap-1">
              <button
                onClick={() => { onRemove(job.id); setConfirmRemove(false); }}
                className="flex size-6 items-center justify-center rounded-full bg-red-600 text-white shadow-md transition-transform hover:scale-110"
                title="Evet, kaldır"
              >
                <Trash2 className="size-3.5" />
              </button>
              <button
                onClick={() => setConfirmRemove(false)}
                className="flex size-6 items-center justify-center rounded-full bg-gray-300 text-gray-700 shadow-md transition-transform hover:scale-110"
                title="Vazgeç"
              >
                ✕
              </button>
            </div>
          ) : (
            <button
              onClick={() => setConfirmRemove(true)}
              className="flex size-6 items-center justify-center rounded-full bg-red-100 text-red-400 shadow-sm transition-all hover:bg-red-600 hover:text-white hover:shadow-md opacity-0 group-hover/card:opacity-100"
              title="Bu ilanı kaldır"
            >
              <Trash2 className="size-3.5" />
            </button>
          )}
        </div>
      )}
    </Card>
  );
}
