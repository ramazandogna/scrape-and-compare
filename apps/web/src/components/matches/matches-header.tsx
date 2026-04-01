"use client";

import { Trophy } from "lucide-react";

// ═══════════════════════════════════════════
// MatchesHeader — Eşleşme sonuçları başlık
// ═══════════════════════════════════════════

interface MatchesHeaderProps {
  total: number;
  filtered: number;
}

export function MatchesHeader({ total, filtered }: MatchesHeaderProps) {
  const hasFilter = total !== filtered;

  return (
    <div className="flex items-center gap-3">
      <div className="flex size-10 items-center justify-center rounded-lg bg-primary/10">
        <Trophy className="size-5 text-primary" />
      </div>
      <div>
        <h1 className="text-2xl font-bold tracking-tight">
          AI Eşleşme Sonuçları
        </h1>
        <p className="text-sm text-muted-foreground">
          {hasFilter ? (
            <>
              <span className="font-medium text-foreground">{filtered}</span> /{" "}
              {total} eşleşme gösteriliyor
            </>
          ) : (
            <>
              <span className="font-medium text-foreground">{total}</span>{" "}
              eşleşme bulundu
            </>
          )}
        </p>
      </div>
    </div>
  );
}
