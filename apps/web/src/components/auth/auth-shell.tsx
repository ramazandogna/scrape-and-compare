"use client";

import { Sparkles, Target, Zap } from "lucide-react";
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

// ═══════════════════════════════════════════
// AuthShell — sign-in / sign-up / forgot-password için ortak iki sütunlu layout
// ═══════════════════════════════════════════
// Sol: marka + 2 stat tile + 2 görsel (sm+ ekranda)
// Sağ: form children
// Site paletiyle uyumlu (violet/fuchsia + emerald/amber accent).

interface AuthShellProps {
  /** Sağ panelin başlığı + açıklaması */
  heading: ReactNode;
  description: ReactNode;
  /** Form */
  children: ReactNode;
  /** Header'ın alt sağ köşesinde "Hesabın yok mu? Kaydol" gibi link */
  topRight?: ReactNode;
}

export function AuthShell({
  heading,
  description,
  children,
  topRight,
}: AuthShellProps) {
  return (
    <div className="relative min-h-[calc(100vh-3.5rem)] w-full bg-gradient-to-br from-violet-50 via-background to-fuchsia-50 px-4 py-8 sm:px-6 lg:py-12">
      {/* Soft glow orbs */}
      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        <div className="absolute -left-24 top-12 size-72 rounded-full bg-violet-200/40 blur-3xl" />
        <div className="absolute -right-24 bottom-12 size-72 rounded-full bg-fuchsia-200/40 blur-3xl" />
      </div>

      <div className="relative mx-auto w-full max-w-6xl">
        <div
          className={cn(
            "grid overflow-hidden rounded-3xl border bg-card/95 shadow-xl shadow-violet-500/10 backdrop-blur",
            "lg:grid-cols-[1.1fr_1fr]",
          )}
        >
          {/* SOL — marka kolajı (sm- ekranda gizli) */}
          <BrandPanel />

          {/* SAĞ — form */}
          <div className="flex flex-col gap-6 p-7 sm:p-10">
            {topRight && (
              <div className="flex items-center justify-end text-xs text-muted-foreground">
                {topRight}
              </div>
            )}

            <div className="space-y-1.5">
              <h1 className="text-2xl font-bold tracking-tight">{heading}</h1>
              <p className="text-sm leading-relaxed text-muted-foreground">
                {description}
              </p>
            </div>

            {children}
          </div>
        </div>
      </div>
    </div>
  );
}

function BrandPanel() {
  return (
    <div className="hidden flex-col justify-between bg-gradient-to-br from-violet-600 via-fuchsia-600 to-violet-700 p-10 text-white lg:flex">
      <div className="space-y-3">
        <div className="inline-flex items-center gap-2 rounded-full border border-white/20 bg-white/10 px-3 py-1 text-[11px] font-medium backdrop-blur">
          <span className="size-1.5 rounded-full bg-emerald-300 shadow-[0_0_0_3px] shadow-emerald-300/30" />
          AI destekli iş eşleşmesi
        </div>
        <h2 className="text-3xl font-bold leading-tight">
          İlanları kovala, AI seninle başvursun.
        </h2>
        <p className="max-w-md text-sm text-white/85">
          Her tarama 50+ ilan, profile uygun puanlama ve eşleşme açıklaması
          ile gelir. İşi sen seçersin — gerisini sistem hallediyor.
        </p>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <StatTile
          icon={<Target className="size-4" />}
          value="50+"
          label="ilan / tarama hedefi"
        />
        <StatTile
          icon={<Sparkles className="size-4" />}
          value="0-100"
          label="AI puanlama skoru"
        />
        <StatTile
          icon={<Zap className="size-4" />}
          value="Auto"
          label="puanlama tetikleyici"
        />
        <StatTile
          icon={<Sparkles className="size-4" />}
          value="LinkedIn"
          label="ilk kanal — daha fazlası geliyor"
        />
      </div>
    </div>
  );
}

function StatTile({
  icon,
  value,
  label,
}: {
  icon: ReactNode;
  value: string;
  label: string;
}) {
  return (
    <div className="rounded-xl border border-white/15 bg-white/10 p-3 backdrop-blur-sm">
      <div className="flex items-center gap-1.5 text-[11px] font-medium text-white/80">
        {icon}
        {label}
      </div>
      <p className="mt-1.5 text-xl font-bold">{value}</p>
    </div>
  );
}
