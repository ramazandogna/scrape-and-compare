import { useMemo, useState } from "react";
import { cn } from "@/lib/utils";
import { getAvatarColor, getInitial } from "@/lib/job-helpers";

// ═══════════════════════════════════════════
// CompanyAvatar — Şirket logosu veya renkli baş harf
// ═══════════════════════════════════════════
// 1. Scrape edilen logoUrl varsa onu dene.
// 2. Yoksa / 404 dönerse Clearbit'i kademeli adaylarla dene.
// 3. Hepsi başarısız olursa deterministik renkli baş harf.

interface CompanyAvatarProps {
  company: string;
  logoUrl?: string | null;
  size?: "sm" | "md";
  className?: string;
}

/** Şirket adından kademeli Clearbit domain adayları üretir.
 *  ICterra Information and Communication Technologies → icterra.com, icterra.com.tr */
function buildClearbitDomains(company: string): string[] {
  const cleaned = company
    .toLowerCase()
    .replace(
      /\s+(inc\.?|ltd\.?|llc\.?|corp\.?|co\.?|gmbh|holding|group|technologies|technology|tech|labs|software|solutions|systems|a\.?ş\.?|a\.s\.?)\b/gi,
      " ",
    )
    .replace(/[.,()&]/g, " ")
    .trim();

  const tokens = cleaned.split(/\s+/).filter(Boolean);
  if (tokens.length === 0) return [];

  const fullJoined = tokens.join("").replace(/[^a-z0-9]/g, "");
  const firstToken = tokens[0]!.replace(/[^a-z0-9]/g, "");
  const firstTwo = tokens.slice(0, 2).join("").replace(/[^a-z0-9]/g, "");

  const set = new Set<string>();
  if (firstToken && firstToken.length >= 3) {
    set.add(`${firstToken}.com`);
    set.add(`${firstToken}.com.tr`);
  }
  if (firstTwo && firstTwo !== firstToken) {
    set.add(`${firstTwo}.com`);
  }
  if (fullJoined && fullJoined.length <= 25 && fullJoined !== firstToken && fullJoined !== firstTwo) {
    set.add(`${fullJoined}.com`);
  }

  return Array.from(set);
}

export function CompanyAvatar({
  company,
  logoUrl,
  size = "md",
  className,
}: CompanyAvatarProps) {
  const colorClasses = getAvatarColor(company);
  const initial = getInitial(company);

  const candidates = useMemo(() => {
    const list: string[] = [];
    const trimmed = logoUrl?.trim();
    if (trimmed) list.push(trimmed);
    for (const domain of buildClearbitDomains(company)) {
      list.push(`https://logo.clearbit.com/${domain}`);
    }
    return list;
  }, [company, logoUrl]);

  const [candidateIndex, setCandidateIndex] = useState(0);
  const sizeClass = size === "sm" ? "size-8" : "size-10";

  if (candidateIndex < candidates.length) {
    return (
      <div
        className={cn(
          "flex shrink-0 items-center justify-center overflow-hidden rounded-lg bg-white border border-border/50",
          sizeClass,
          className,
        )}
        aria-hidden="true"
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          key={candidates[candidateIndex]}
          src={candidates[candidateIndex]}
          alt={company}
          className="size-full object-contain p-0.5"
          onError={() => setCandidateIndex((i) => i + 1)}
        />
      </div>
    );
  }

  return (
    <div
      className={cn(
        "flex shrink-0 items-center justify-center rounded-lg font-bold",
        size === "sm" ? "size-8 text-sm" : "size-10 text-base",
        colorClasses,
        className,
      )}
      aria-hidden="true"
    >
      {initial}
    </div>
  );
}
