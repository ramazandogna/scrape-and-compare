"use client";

import { ChevronLeft, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";

// ═══════════════════════════════════════════
// Pagination — Client-side sayfalama kontrolü
// ═══════════════════════════════════════════
// Aktif sayfa: violet→fuchsia gradient (site CTA paleti ile uyumlu).

interface PaginationProps {
  page: number;
  totalPages: number;
  onPageChange: (page: number) => void;
}

export function Pagination({ page, totalPages, onPageChange }: PaginationProps) {
  if (totalPages <= 1) return null;

  const pages = getVisiblePages(page, totalPages);

  return (
    <nav
      className="mt-4 flex items-center justify-center gap-1.5"
      aria-label="Sayfalama"
    >
      <ArrowButton
        direction="prev"
        disabled={page <= 1}
        onClick={() => onPageChange(page - 1)}
      />

      {pages.map((p, i) =>
        p === "..." ? (
          <span
            key={`ellipsis-${i}`}
            className="px-1 text-sm text-muted-foreground"
          >
            …
          </span>
        ) : (
          <button
            key={p}
            type="button"
            onClick={() => onPageChange(p)}
            disabled={p === page}
            className={cn(
              "inline-flex h-8 min-w-8 cursor-pointer items-center justify-center rounded-lg px-2 text-sm font-medium transition-all duration-200 ease-out active:scale-95",
              p === page
                ? "bg-brand-gradient shadow-brand pointer-events-none text-white"
                : "border border-transparent bg-background text-muted-foreground hover:border-border hover:bg-muted hover:text-foreground",
            )}
          >
            {p}
          </button>
        ),
      )}

      <ArrowButton
        direction="next"
        disabled={page >= totalPages}
        onClick={() => onPageChange(page + 1)}
      />
    </nav>
  );
}

function ArrowButton({
  direction,
  disabled,
  onClick,
}: {
  direction: "prev" | "next";
  disabled: boolean;
  onClick: () => void;
}) {
  const Icon = direction === "prev" ? ChevronLeft : ChevronRight;
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      aria-label={direction === "prev" ? "Önceki sayfa" : "Sonraki sayfa"}
      className={cn(
        "inline-flex size-8 cursor-pointer items-center justify-center rounded-lg border text-muted-foreground transition-all duration-200 ease-out active:scale-95",
        "hover:border-foreground/20 hover:bg-muted hover:text-foreground",
        "disabled:cursor-not-allowed disabled:border-border/40 disabled:text-muted-foreground/40 disabled:hover:bg-transparent",
      )}
    >
      <Icon className="size-4" />
    </button>
  );
}

/**
 * Sayfa numaralarını hesaplar. Örnek:
 * page=5, total=10 → [1, "...", 4, 5, 6, "...", 10]
 */
function getVisiblePages(
  current: number,
  total: number,
): (number | "...")[] {
  if (total <= 5) {
    return Array.from({ length: total }, (_, i) => i + 1);
  }

  const pages: (number | "...")[] = [];

  pages.push(1);
  if (current > 3) pages.push("...");

  const start = Math.max(2, current - 1);
  const end = Math.min(total - 1, current + 1);
  for (let i = start; i <= end; i++) pages.push(i);

  if (current < total - 2) pages.push("...");
  pages.push(total);

  return pages;
}
