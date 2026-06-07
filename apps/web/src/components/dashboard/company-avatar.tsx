import { useMemo, useState } from "react";
import { cn } from "@/lib/utils";
import { getInitial } from "@/lib/job-helpers";

// Deterministic gradient derived from company name — matches the card, modern look.
// Same company always gets the same gradient (hash-based).
const GRADIENT_PALETTE = [
  "from-violet-500 to-fuchsia-500",
  "from-blue-500 to-indigo-500",
  "from-emerald-500 to-teal-500",
  "from-orange-500 to-rose-500",
  "from-amber-500 to-orange-500",
  "from-cyan-500 to-blue-500",
  "from-rose-500 to-pink-500",
  "from-indigo-500 to-violet-500",
  "from-teal-500 to-cyan-500",
  "from-fuchsia-500 to-pink-500",
] as const;

function pickGradient(name: string): string {
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = name.charCodeAt(i) + ((hash << 5) - hash);
  }
  return GRADIENT_PALETTE[Math.abs(hash) % GRADIENT_PALETTE.length]!;
}

// ═══════════════════════════════════════════
// CompanyAvatar — Company logo or colored initial
// ═══════════════════════════════════════════
// 1. If a scraped logoUrl exists, try it first.
// 2. If missing / 404, try Clearbit with staged domain candidates.
// 3. If all fail, fall back to a deterministic colored initial.

interface CompanyAvatarProps {
  company: string;
  logoUrl?: string | null;
  size?: "sm" | "md";
  className?: string;
}

/** Builds staged Clearbit domain candidates from the company name.
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
  const initial = getInitial(company);
  const gradient = pickGradient(company);

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
  const sizeClass = size === "sm" ? "size-9" : "size-11";
  const textSize = size === "sm" ? "text-sm" : "text-base";

  if (candidateIndex < candidates.length) {
    return (
      <div
        className={cn(
          "relative flex shrink-0 items-center justify-center overflow-hidden rounded-xl border border-border/50 bg-white shadow-xs",
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
          className="size-full object-contain p-1"
          onError={() => setCandidateIndex((i) => i + 1)}
        />
      </div>
    );
  }

  // No logo found → gradient + letter fallback
  // Matches the card: rounded-xl (same corner radius), shadow-xs, ring.
  return (
    <div
      className={cn(
        "relative flex shrink-0 items-center justify-center overflow-hidden rounded-xl bg-gradient-to-br font-semibold text-white shadow-xs ring-1 ring-white/20",
        gradient,
        sizeClass,
        textSize,
        className,
      )}
      aria-hidden="true"
    >
      {/* Top gloss effect — premium feel */}
      <span className="absolute inset-0 rounded-xl bg-gradient-to-tr from-white/20 via-transparent to-transparent" />
      <span className="relative">{initial}</span>
    </div>
  );
}
