"use client";

import { Lock, Check, SlidersHorizontal, X } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { FilterState } from "@/types/job";
import {
  INITIAL_FILTERS,
  SENIORITY_OPTIONS,
  EMPLOYMENT_OPTIONS,
  WORK_TYPE_OPTIONS,
  SALARY_OPTIONS,
  SCORE_OPTIONS,
} from "@/types/job";

// ═══════════════════════════════════════════
// FilterSidebar — sol panel filtreleri (modern pill style)
// ═══════════════════════════════════════════
// Radio davranışı korunuyor: tek seçim, null = "Hepsi".
// Görsel: nokta+text yerine pill — her filtre tıklanabilir hissi veriyor.

interface FilterSidebarProps {
  filters: FilterState;
  onFilterChange: (filters: FilterState) => void;
}

export function FilterSidebar({ filters, onFilterChange }: FilterSidebarProps) {
  function updateFilter<K extends keyof FilterState>(
    key: K,
    value: FilterState[K],
  ) {
    onFilterChange({ ...filters, [key]: value });
  }

  // Aktif filtre sayısı — varsayılana eşit olmayan her filtre 1 sayılır.
  // Header'da chip olarak gösterip "Temizle" butonunu koşullu açıyoruz.
  const activeCount =
    (filters.seniorityLevel !== INITIAL_FILTERS.seniorityLevel ? 1 : 0) +
    (filters.employmentType !== INITIAL_FILTERS.employmentType ? 1 : 0) +
    (filters.workType !== INITIAL_FILTERS.workType ? 1 : 0) +
    (filters.minSalary !== INITIAL_FILTERS.minSalary ? 1 : 0) +
    (filters.scoreStatus !== INITIAL_FILTERS.scoreStatus ? 1 : 0);

  return (
    <aside className="space-y-3">
      <div className="flex items-center gap-2 px-1 pb-1">
        <SlidersHorizontal className="size-4 text-muted-foreground" />
        <h2 className="text-sm font-semibold">Filtreler</h2>
        {activeCount > 0 && (
          <span className="inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-gradient-to-r from-violet-600 to-fuchsia-600 px-1.5 text-[10px] font-semibold text-white">
            {activeCount}
          </span>
        )}
      </div>

      <FilterCard title="Platform">
        <div className="flex flex-wrap gap-1.5">
          <PillOption label="LinkedIn" active disabled />
          <LockedPill label="Indeed" />
          <LockedPill label="HN Jobs" />
        </div>
      </FilterCard>

      <FilterCard title="Kıdem">
        <div className="flex flex-wrap gap-1.5">
          {SENIORITY_OPTIONS.map((opt) => (
            <PillOption
              key={opt.label}
              label={opt.label}
              active={filters.seniorityLevel === opt.value}
              onClick={() => updateFilter("seniorityLevel", opt.value)}
            />
          ))}
        </div>
      </FilterCard>

      <FilterCard title="Çalışma Tipi">
        <div className="flex flex-wrap gap-1.5">
          {EMPLOYMENT_OPTIONS.map((opt) => (
            <PillOption
              key={opt.label}
              label={opt.label}
              active={filters.employmentType === opt.value}
              onClick={() => updateFilter("employmentType", opt.value)}
            />
          ))}
        </div>
      </FilterCard>

      <FilterCard title="Çalışma Şekli">
        <div className="flex flex-wrap gap-1.5">
          {WORK_TYPE_OPTIONS.map((opt) => (
            <PillOption
              key={opt.label}
              label={opt.label}
              active={filters.workType === opt.value}
              onClick={() => updateFilter("workType", opt.value)}
            />
          ))}
        </div>
      </FilterCard>

      <FilterCard title="Maaş Aralığı">
        <div className="flex flex-wrap gap-1.5">
          {SALARY_OPTIONS.map((opt) => (
            <PillOption
              key={opt.label}
              label={opt.label}
              active={filters.minSalary === opt.value}
              onClick={() => updateFilter("minSalary", opt.value)}
            />
          ))}
        </div>
      </FilterCard>

      <FilterCard title="Eşleşme Skoru">
        <div className="flex flex-wrap gap-1.5">
          {SCORE_OPTIONS.map((opt) => (
            <PillOption
              key={opt.label}
              label={opt.label}
              active={filters.scoreStatus === opt.value}
              onClick={() => updateFilter("scoreStatus", opt.value)}
            />
          ))}
        </div>
      </FilterCard>

      <FilterCard title="Otomasyon">
        <div className="flex flex-wrap gap-1.5">
          <LockedPill label="Otomatik tarama" />
          <LockedPill label="Otomatik başvur" />
        </div>
      </FilterCard>

      {/* Sticky alt bar — aktif filtre varsa "Temizle" görünür, yoksa sönük */}
      <div className="sticky bottom-2 mt-2">
        <Button
          variant={activeCount > 0 ? "outline" : "ghost"}
          size="sm"
          disabled={activeCount === 0}
          onClick={() => onFilterChange(INITIAL_FILTERS)}
          className="h-9 w-full gap-2 text-xs"
        >
          <X className="size-3.5" />
          {activeCount > 0
            ? `${activeCount} filtreyi temizle`
            : "Temizlenecek filtre yok"}
        </Button>
      </div>
    </aside>
  );
}

// ═══════════════════════════════════════════
// Sub-components
// ═══════════════════════════════════════════

function FilterCard({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-xl border bg-card/60 p-3 shadow-xs ring-1 ring-foreground/[0.04]">
      <h3 className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
        {title}
      </h3>
      {children}
    </div>
  );
}

function PillOption({
  label,
  active,
  disabled,
  onClick,
}: {
  label: string;
  active: boolean;
  disabled?: boolean;
  onClick?: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={cn(
        "group/pill inline-flex cursor-pointer items-center gap-1 rounded-full border px-2.5 py-1 text-xs font-medium transition-all duration-200 ease-out active:scale-95",
        active
          ? "border-violet-300 bg-gradient-to-r from-violet-100 to-fuchsia-100 text-violet-800 shadow-xs"
          : "border-border bg-background text-muted-foreground hover:border-foreground/20 hover:bg-muted hover:text-foreground",
        disabled && "cursor-not-allowed opacity-60 hover:border-border hover:bg-background",
      )}
    >
      {/* width transition + scale: aktif olunca check yumuşakça açılır */}
      <span
        className={cn(
          "inline-flex items-center overflow-hidden transition-all duration-200",
          active ? "w-3 opacity-100" : "w-0 opacity-0",
        )}
      >
        <Check className="size-3" />
      </span>
      {label}
    </button>
  );
}

function LockedPill({ label }: { label: string }) {
  return (
    <span className="inline-flex cursor-not-allowed items-center gap-1 rounded-full border border-dashed border-border/70 bg-muted/30 px-2.5 py-1 text-xs text-muted-foreground/70">
      <Lock className="size-3" />
      {label}
      <Badge variant="outline" className="ml-1 h-4 border-amber-300/70 bg-amber-50 px-1 text-[9px] text-amber-700">
        yakında
      </Badge>
    </span>
  );
}
