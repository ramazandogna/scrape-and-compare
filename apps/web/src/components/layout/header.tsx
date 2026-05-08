"use client";

import Link from "next/link";
import { useRouter, usePathname } from "next/navigation";
import { LogOut } from "lucide-react";
import { cn } from "@/lib/utils";
import { useAuth } from "@/contexts/auth-context";
import { ThemeToggle } from "@/components/layout/theme-toggle";

const NAV_ITEMS = [
  { href: "/dashboard", label: "Dashboard" },
  { href: "/matches", label: "Eşleşmeler" },
  { href: "/favorites", label: "Favori İlanlar" },
  { href: "/profile", label: "Profil" },
] as const;

export function Header() {
  const pathname = usePathname();
  const router = useRouter();
  const { user, status, logout } = useAuth();
  const isAuthed = status === "authenticated" && user !== null;

  async function handleLogout() {
    await logout();
    router.replace("/sign-in");
  }

  return (
    <header className="sticky top-0 z-50 border-b border-border/60 bg-background/80 backdrop-blur-xl supports-backdrop-filter:bg-background/55">
      <div className="mx-auto flex h-14 max-w-7xl items-center justify-between px-4 sm:px-6 lg:px-8">
        <Link href="/dashboard" className="group/logo flex items-center gap-2.5">
          <span className="bg-brand-gradient shadow-brand relative inline-flex size-9 items-center justify-center rounded-xl text-sm font-bold text-white ring-1 ring-white/10 transition-transform group-hover/logo:scale-105">
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
                  <span className="bg-brand-gradient absolute inset-x-2 -bottom-px h-0.5 rounded-full" />
                )}
              </Link>
            );
          })}

          <span className="mx-1 hidden h-5 w-px bg-border sm:block" />
          <ThemeToggle />

          {isAuthed && (
            <>
              <span className="mx-1 hidden h-5 w-px bg-border sm:block" />
              <span className="hidden text-xs text-muted-foreground sm:inline-flex">
                {user.name}
              </span>
              <button
                type="button"
                onClick={() => void handleLogout()}
                title="Çıkış yap"
                className="ml-1 inline-flex cursor-pointer items-center gap-1 rounded-lg px-2.5 py-1.5 text-xs font-medium text-muted-foreground transition-colors hover:bg-rose-50 hover:text-rose-600 dark:hover:bg-rose-950/30"
              >
                <LogOut className="size-3.5" />
                <span className="hidden sm:inline">Çıkış</span>
              </button>
            </>
          )}
        </nav>
      </div>
    </header>
  );
}
