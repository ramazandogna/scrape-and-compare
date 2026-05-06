"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

const NAV_ITEMS = [
  { href: "/dashboard", label: "Dashboard" },
  { href: "/matches", label: "Eşleşmeler" },
  { href: "/favorites", label: "Favori İlanlar" },
  { href: "/profile", label: "Profil" },
] as const;

export function Header() {
  const pathname = usePathname();

  return (
    <header className="sticky top-0 z-50 border-b border-border/60 bg-background/80 backdrop-blur-xl supports-backdrop-filter:bg-background/55">
      <div className="mx-auto flex h-14 max-w-7xl items-center justify-between px-4 sm:px-6 lg:px-8">
        <Link href="/dashboard" className="group/logo flex items-center gap-2.5">
          <span className="relative inline-flex size-9 items-center justify-center rounded-xl bg-gradient-to-br from-violet-600 via-fuchsia-500 to-violet-700 text-sm font-bold text-white shadow-sm shadow-fuchsia-500/30 ring-1 ring-white/10 transition-transform group-hover/logo:scale-105">
            <span className="absolute inset-0 rounded-xl bg-gradient-to-tr from-white/20 via-transparent to-transparent" />
            <span className="relative">S</span>
          </span>
          <div className="hidden sm:block">
            <p className="bg-gradient-to-r from-foreground to-foreground/70 bg-clip-text text-sm font-semibold leading-none text-transparent">
              Scrape &amp; Compare
            </p>
            <p className="mt-0.5 text-[11px] text-muted-foreground">
              AI-Powered Job Matching
            </p>
          </div>
        </Link>

        <nav className="flex items-center gap-0.5">
          {NAV_ITEMS.map((item) => {
            const isActive = pathname === item.href;
            return (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  "relative cursor-pointer rounded-lg px-3 py-1.5 text-sm font-medium transition-colors",
                  isActive
                    ? "text-foreground"
                    : "text-muted-foreground hover:bg-muted/60 hover:text-foreground",
                )}
              >
                {item.label}
                {isActive && (
                  <span className="absolute inset-x-2 -bottom-px h-0.5 rounded-full bg-gradient-to-r from-violet-600 to-fuchsia-500" />
                )}
              </Link>
            );
          })}
        </nav>
      </div>
    </header>
  );
}
