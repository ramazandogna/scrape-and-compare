"use client";

// ═══════════════════════════════════════════
// ScoreFilter — Minimum skor slider
// ═══════════════════════════════════════════

interface ScoreFilterProps {
  value: number;
  onChange: (value: number) => void;
}

const SCORE_STEPS = [0, 50, 60, 70, 80, 90];

export function ScoreFilter({ value, onChange }: ScoreFilterProps) {
  return (
    <div className="mt-4 flex flex-wrap items-center gap-2 rounded-lg border bg-muted/30 px-4 py-2.5">
      <span className="text-sm text-muted-foreground">Min. skor:</span>
      <div className="flex items-center gap-1">
        {SCORE_STEPS.map((step) => (
          <button
            key={step}
            type="button"
            onClick={() => onChange(step)}
            className={`min-w-[3rem] rounded-md px-2.5 py-1 text-xs font-medium transition-colors ${
              value === step
                ? "bg-primary text-primary-foreground"
                : "bg-background text-muted-foreground hover:bg-muted hover:text-foreground"
            }`}
          >
            {step === 0 ? "Hepsi" : `≥${step}`}
          </button>
        ))}
      </div>
    </div>
  );
}
