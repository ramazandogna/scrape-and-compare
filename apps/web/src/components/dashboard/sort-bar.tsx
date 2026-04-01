"use client";

import { ArrowUpDown, ArrowUp, ArrowDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { SortField, SortState } from "@/types/job";

// ═══════════════════════════════════════════
// SortBar — Tri-state sıralama toggle butonları
// ═══════════════════════════════════════════
// Tıklama döngüsü: nötr → asc → desc → nötr
// Aynı anda sadece 1 sıralama aktif.
// Aktif sıralama: mavi + yön oku.

interface SortBarProps {
  sort: SortState;
  onSortChange: (sort: SortState) => void;
  total: number;
}

interface SortOption {
  field: SortField;
  label: string;
  icon: string;
}

const SORT_OPTIONS: SortOption[] = [
  { field: "date", label: "Tarih", icon: "📅" },
  { field: "salary", label: "Maaş", icon: "💰" },
  { field: "score", label: "Skor", icon: "⭐" },
];

function getNextSort(current: SortState, field: SortField): SortState {
  // Farklı alan → asc ile başla
  if (current.field !== field) return { field, direction: "asc" };
  // Aynı alan → tri-state döngüsü
  if (current.direction === "asc") return { field, direction: "desc" };
  // desc → default'a sıfırla
  return { field: "default", direction: "desc" };
}

function SortIcon({ sort, field }: { sort: SortState; field: SortField }) {
  if (sort.field !== field) return <ArrowUpDown className="size-3 opacity-50" />;
  if (sort.direction === "asc") return <ArrowUp className="size-3" />;
  return <ArrowDown className="size-3" />;
}

export function SortBar({ sort, onSortChange, total }: SortBarProps) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border bg-muted/30 px-3 py-2">
      <span className="text-sm text-muted-foreground">
        <span className="font-medium text-foreground">{total}</span> ilan
      </span>

      <div className="flex items-center gap-1">
        <span className="mr-1 text-xs text-muted-foreground">Sırala:</span>
        {SORT_OPTIONS.map((opt) => {
          const isActive = sort.field === opt.field;
          return (
            <Button
              key={opt.field}
              variant={isActive ? "secondary" : "ghost"}
              size="xs"
              onClick={() => onSortChange(getNextSort(sort, opt.field))}
              className={cn(
                "gap-1 text-xs",
                isActive && "font-semibold text-primary"
              )}
            >
              <span>{opt.icon}</span>
              {opt.label}
              <SortIcon sort={sort} field={opt.field} />
            </Button>
          );
        })}
      </div>
    </div>
  );
}
