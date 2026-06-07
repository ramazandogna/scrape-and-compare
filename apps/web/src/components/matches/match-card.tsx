"use client";

import { useState } from "react";
import {
  ExternalLink,
  ChevronDown,
  ChevronUp,
  CheckCircle,
  XCircle,
  MapPin,
  Building2,
  Briefcase,
} from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import type { MatchResultDto } from "@/types/job";

// ═══════════════════════════════════════════
// MatchCard — Single match result card
// ═══════════════════════════════════════════
// Score badge (color-coded) + Position + Description
// Expandable: matchedSkills ✅ / missingSkills ❌
// LinkedIn link

interface MatchCardProps {
  match: MatchResultDto;
}

export function MatchCard({ match }: MatchCardProps) {
  const [expanded, setExpanded] = useState(false);
  const config = getScoreConfig(match.score);

  return (
    <Card className="overflow-hidden transition-shadow hover:shadow-md">
      <CardContent className="p-0">
        {/* Main row */}
        <div className="flex items-start gap-4 p-4 sm:p-5">
          {/* Score circle */}
          <div
            className={cn(
              "flex size-14 shrink-0 flex-col items-center justify-center rounded-full border-2",
              config.borderClass,
              config.bgClass
            )}
          >
            <span className={cn("text-lg font-bold leading-none", config.textClass)}>
              {Math.round(match.score)}
            </span>
            <span className={cn("text-[9px] font-medium", config.textClass)}>puan</span>
          </div>

          {/* Listing info */}
          <div className="min-w-0 flex-1">
            <div className="flex items-start justify-between gap-2">
              <div>
                <h3 className="font-semibold leading-snug">{match.job.title}</h3>
                <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-muted-foreground">
                  <span className="flex items-center gap-1">
                    <Building2 className="size-3.5" />
                    {match.job.company}
                  </span>
                  <span className="flex items-center gap-1">
                    <MapPin className="size-3.5" />
                    {match.job.location}
                  </span>
                  {match.job.seniorityLevel && (
                    <span className="flex items-center gap-1">
                      <Briefcase className="size-3.5" />
                      {match.job.seniorityLevel}
                    </span>
                  )}
                </div>
              </div>

              {/* Score label badge */}
              <Badge
                variant="outline"
                className={cn("shrink-0 text-xs", config.badgeClass)}
              >
                {config.label}
              </Badge>
            </div>

            {/* AI Explanation */}
            <p className="mt-2.5 text-sm leading-relaxed text-muted-foreground">
              {match.explanation}
            </p>

            {/* Quick skills preview (collapsed) */}
            {!expanded && (
              <div className="mt-2 flex flex-wrap gap-1">
                {match.matchedSkills.slice(0, 4).map((s) => (
                  <Badge
                    key={`m-${s}`}
                    variant="default"
                    className="gap-0.5 bg-green-100 text-[11px] text-green-700 hover:bg-green-100"
                  >
                    <CheckCircle className="size-3" />
                    {s}
                  </Badge>
                ))}
                {match.missingSkills.slice(0, 2).map((s) => (
                  <Badge
                    key={`x-${s}`}
                    variant="outline"
                    className="gap-0.5 text-[11px] text-muted-foreground"
                  >
                    <XCircle className="size-3" />
                    {s}
                  </Badge>
                ))}
                {match.matchedSkills.length + match.missingSkills.length > 6 && (
                  <span className="self-center text-[11px] text-muted-foreground">
                    +{match.matchedSkills.length + match.missingSkills.length - 6} daha
                  </span>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Expand button + detail */}
        <div className="border-t">
          <button
            type="button"
            onClick={() => setExpanded(!expanded)}
            className="flex w-full items-center justify-center gap-1 px-4 py-2 text-xs text-muted-foreground transition-colors hover:bg-muted/50 hover:text-foreground"
          >
            {expanded ? (
              <>
                <ChevronUp className="size-3.5" />
                Daralt
              </>
            ) : (
              <>
                <ChevronDown className="size-3.5" />
                Detayları gör
              </>
            )}
          </button>

          {expanded && (
            <div className="border-t px-5 py-4 space-y-4">
              {/* Matched skills */}
              {match.matchedSkills.length > 0 && (
                <div>
                  <h4 className="text-xs font-semibold text-green-700 mb-1.5">
                    Eşleşen Yetenekler ({match.matchedSkills.length})
                  </h4>
                  <div className="flex flex-wrap gap-1.5">
                    {match.matchedSkills.map((s) => (
                      <Badge
                        key={s}
                        variant="default"
                        className="gap-1 bg-green-100 text-xs text-green-700 hover:bg-green-100"
                      >
                        <CheckCircle className="size-3" />
                        {s}
                      </Badge>
                    ))}
                  </div>
                </div>
              )}

              {/* Missing skills */}
              {match.missingSkills.length > 0 && (
                <div>
                  <h4 className="mb-1.5 text-xs font-semibold text-muted-foreground">
                    Eksik Yetenekler ({match.missingSkills.length})
                  </h4>
                  <div className="flex flex-wrap gap-1.5">
                    {match.missingSkills.map((s) => (
                      <Badge
                        key={s}
                        variant="outline"
                        className="gap-1 text-xs text-muted-foreground"
                      >
                        <XCircle className="size-3" />
                        {s}
                      </Badge>
                    ))}
                  </div>
                </div>
              )}

              {/* LinkedIn link */}
              <div className="pt-1">
                <a
                  href={match.job.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1.5 text-sm font-medium text-primary hover:underline"
                >
                  <ExternalLink className="size-3.5" />
                  LinkedIn&apos;de görüntüle
                </a>
              </div>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

// ── Score config ──────────────────────────

interface ScoreConfig {
  label: string;
  bgClass: string;
  borderClass: string;
  textClass: string;
  badgeClass: string;
}

function getScoreConfig(score: number): ScoreConfig {
  if (score >= 80) {
    return {
      label: "Mükemmel Eşleşme",
      bgClass: "bg-red-50",
      borderClass: "border-red-300",
      textClass: "text-red-700",
      badgeClass: "border-red-200 bg-red-50 text-red-700",
    };
  }
  if (score >= 60) {
    return {
      label: "İyi Eşleşme",
      bgClass: "bg-green-50",
      borderClass: "border-green-300",
      textClass: "text-green-700",
      badgeClass: "border-green-200 bg-green-50 text-green-700",
    };
  }
  return {
    label: "Orta Eşleşme",
    bgClass: "bg-yellow-50",
    borderClass: "border-yellow-300",
    textClass: "text-yellow-700",
    badgeClass: "border-yellow-200 bg-yellow-50 text-yellow-700",
  };
}
