import { cn } from "@/lib/utils";
import { getAvatarColor, getInitial } from "@/lib/job-helpers";

// ═══════════════════════════════════════════
// CompanyAvatar — Şirket baş harfi + deterministik renk
// ═══════════════════════════════════════════
// Scraper logo çekemiyor → şirket adının hash'inden renk üretilir.
// "Linear" → mor arka planlı "L", "Notion" → turuncu "N" vb.
// djb2 hash → AVATAR_COLORS dizisindeki index.

interface CompanyAvatarProps {
  company: string;
  size?: "sm" | "md";
  className?: string;
}

export function CompanyAvatar({
  company,
  size = "md",
  className,
}: CompanyAvatarProps) {
  const colorClasses = getAvatarColor(company);
  const initial = getInitial(company);

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
