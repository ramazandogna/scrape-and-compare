"use client";

import { ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

// ═══════════════════════════════════════════
// Pagination — Client-side sayfalama kontrolü
// ═══════════════════════════════════════════

interface PaginationProps {
  page: number;
  totalPages: number;
  onPageChange: (page: number) => void;
}

export function Pagination({ page, totalPages, onPageChange }: PaginationProps) {
  if (totalPages <= 1) return null;

  /** Görünür sayfa numaralarını hesapla (max 5 sayfa göster) */
  const pages = getVisiblePages(page, totalPages);

  return (
    <nav className="flex items-center justify-center gap-1" aria-label="Sayfalama">
      <Button
        variant="ghost"
        size="icon-sm"
        disabled={page <= 1}
        onClick={() => onPageChange(page - 1)}
        aria-label="Önceki sayfa"
      >
        <ChevronLeft className="size-4" />
      </Button>

      {pages.map((p, i) =>
        p === "..." ? (
          <span key={`ellipsis-${i}`} className="px-1 text-sm text-muted-foreground">
            ...
          </span>
        ) : (
          <Button
            key={p}
            variant={p === page ? "secondary" : "ghost"}
            size="sm"
            onClick={() => onPageChange(p)}
            className={cn(
              "min-w-8",
              p === page && "pointer-events-none font-bold"
            )}
          >
            {p}
          </Button>
        )
      )}

      <Button
        variant="ghost"
        size="icon-sm"
        disabled={page >= totalPages}
        onClick={() => onPageChange(page + 1)}
        aria-label="Sonraki sayfa"
      >
        <ChevronRight className="size-4" />
      </Button>
    </nav>
  );
}

/**
 * Sayfa numaralarını hesaplar. Örnek:
 * page=5, total=10 → [1, "...", 4, 5, 6, "...", 10]
 */
function getVisiblePages(
  current: number,
  total: number
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
