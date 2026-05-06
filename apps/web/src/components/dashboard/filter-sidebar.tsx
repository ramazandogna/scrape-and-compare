"use client";

import { Lock, Check, SlidersHorizontal } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import type { FilterState } from "@/types/job";
import {
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

  return (
    <aside className="space-y-3">
      <div className="flex items-center gap-2 px-1 pb-1">
        <SlidersHorizontal className="size-4 text-muted-foreground" />
        <h2 className="text-sm font-semibold">Filtreler</h2>
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
        "inline-flex cursor-pointer items-center gap-1 rounded-full border px-2.5 py-1 text-xs font-medium transition-colors",
        active
          ? "border-violet-300 bg-gradient-to-r from-violet-100 to-fuchsia-100 text-violet-800 shadow-xs"
          : "border-border bg-background text-muted-foreground hover:border-foreground/20 hover:bg-muted hover:text-foreground",
        disabled && "cursor-not-allowed opacity-60 hover:border-border hover:bg-background",
      )}
    >
      {active && <Check className="size-3" />}
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
