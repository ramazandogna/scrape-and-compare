import { useState } from "react";
import { cn } from "@/lib/utils";
import { getAvatarColor, getInitial } from "@/lib/job-helpers";

// ═══════════════════════════════════════════
// CompanyAvatar — Şirket logosu veya renkli baş harf
// ═══════════════════════════════════════════
// Clearbit Logo API üzerinden logo çekilmeye çalışılır.
// 404 / yükleme hatası → deterministik renkli baş harf fallback.

interface CompanyAvatarProps {
  company: string;
  logoUrl?: string | null;
  size?: "sm" | "md";
  className?: string;
}

/** Şirket adından Clearbit domain tahmini üretir */
function toClearbitDomain(company: string): string {
  return company
    .toLowerCase()
    .replace(/\s+(inc\.?|ltd\.?|llc\.?|corp\.?|a\.?ş\.?|a\.s\.?)$/i, "")
    .trim()
    .replace(/\s+/g, "")
    .replace(/[^a-z0-9]/g, "") + ".com";
}

export function CompanyAvatar({
  company,
  logoUrl,
  size = "md",
  className,
}: CompanyAvatarProps) {
  const colorClasses = getAvatarColor(company);
  const initial = getInitial(company);
  const [logoFailed, setLogoFailed] = useState(false);

  const sizeClass = size === "sm" ? "size-8" : "size-10";
  const domain = toClearbitDomain(company);
  const clearbitLogoUrl = `https://logo.clearbit.com/${domain}`;
  const preferredLogoUrl = logoUrl?.trim() || clearbitLogoUrl;

  if (!logoFailed) {
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
          src={preferredLogoUrl}
          alt={company}
          className="size-full object-contain p-0.5"
          onError={() => setLogoFailed(true)}
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
        className
      )}
      aria-hidden="true"
    >
      {initial}
    </div>
  );
}
