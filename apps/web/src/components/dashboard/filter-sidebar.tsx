"use client";

import { Lock } from "lucide-react";
import { Separator } from "@/components/ui/separator";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import type { FilterState } from "@/types/job";
import {
  SENIORITY_OPTIONS,
  EMPLOYMENT_OPTIONS,
  SALARY_OPTIONS,
  SCORE_OPTIONS,
} from "@/types/job";

// ═══════════════════════════════════════════
// FilterSidebar — Sol panel filtreleri
// ═══════════════════════════════════════════
// Her filtre grubu radio-button pattern (tek seçim).
// null = "Hepsi" / filtre yok.
// Locked özellikler: Indeed, HN Jobs, Otomasyon

interface FilterSidebarProps {
  filters: FilterState;
  onFilterChange: (filters: FilterState) => void;
}

export function FilterSidebar({ filters, onFilterChange }: FilterSidebarProps) {
  function updateFilter<K extends keyof FilterState>(
    key: K,
    value: FilterState[K]
  ) {
    onFilterChange({ ...filters, [key]: value });
  }

  return (
    <aside className="space-y-5">
      {/* Platform */}
      <FilterSection title="Platform">
        <label className="flex items-center gap-2 px-2 py-1 text-sm">
          <input
            type="checkbox"
            checked={true}
            disabled
            className="size-3.5 shrink-0 accent-primary"
          />
          <span>LinkedIn</span>
        </label>
        <LockedOption label="Indeed" />
        <LockedOption label="HN Jobs" />
      </FilterSection>

      <Separator />

      {/* Kıdem */}
      <FilterSection title="Kıdem">
        {SENIORITY_OPTIONS.map((opt) => (
          <RadioOption
            key={opt.label}
            label={opt.label}
            active={filters.seniorityLevel === opt.value}
            onClick={() => updateFilter("seniorityLevel", opt.value)}
          />
        ))}
      </FilterSection>

      <Separator />

      {/* Çalışma Tipi */}
      <FilterSection title="Çalışma Tipi">
        {EMPLOYMENT_OPTIONS.map((opt) => (
          <RadioOption
            key={opt.label}
            label={opt.label}
            active={filters.employmentType === opt.value}
            onClick={() => updateFilter("employmentType", opt.value)}
          />
        ))}
      </FilterSection>

      <Separator />

      {/* Maaş */}
      <FilterSection title="Maaş Aralığı">
        {SALARY_OPTIONS.map((opt) => (
          <RadioOption
            key={opt.label}
            label={opt.label}
            active={filters.minSalary === opt.value}
            onClick={() => updateFilter("minSalary", opt.value)}
          />
        ))}
      </FilterSection>

      <Separator />

      {/* Eşleşme Skoru */}
      <FilterSection title="Eşleşme Skoru">
        {SCORE_OPTIONS.map((opt) => (
          <RadioOption
            key={opt.label}
            label={opt.label}
            active={filters.scoreStatus === opt.value}
            onClick={() => updateFilter("scoreStatus", opt.value)}
          />
        ))}
      </FilterSection>

      <Separator />

      {/* Locked Otomasyon */}
      <FilterSection title="Otomasyon">
        <LockedOption label="Otomatik tarama" />
        <LockedOption label="Otomatik başvur" />
      </FilterSection>
    </aside>
  );
}

// ═══════════════════════════════════════════
// Sub-components
// ═══════════════════════════════════════════

function FilterSection({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-2">
      <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
        {title}
      </h3>
      <div className="space-y-1">{children}</div>
    </div>
  );
}

function RadioOption({
  label,
  active,
  onClick,
}: {
  label: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "flex w-full items-center gap-2 rounded-md px-2 py-1 text-left text-sm transition-colors",
        active
          ? "bg-primary/10 font-medium text-primary"
          : "text-muted-foreground hover:bg-muted hover:text-foreground"
      )}
    >
      <span
        className={cn(
          "size-3 shrink-0 rounded-full border-2",
          active ? "border-primary bg-primary" : "border-muted-foreground/40"
        )}
      />
      {label}
    </button>
  );
}

function LockedOption({ label }: { label: string }) {
  return (
    <div className="flex items-center gap-2 px-2 py-1 text-sm text-muted-foreground/50 cursor-not-allowed">
      <Lock className="size-3.5 shrink-0" />
      <span>{label}</span>
      <Badge variant="outline" className="ml-auto text-[10px] opacity-50">
        Yakında
      </Badge>
    </div>
  );
}
