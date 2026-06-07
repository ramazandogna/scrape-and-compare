"use client";

import { usePathname } from "next/navigation";
import { Header } from "@/components/layout/header";
import { Footer } from "@/components/layout/footer";
import { PageTransition } from "@/components/layout/page-transition";
import { AuthGate } from "@/components/auth/auth-gate";

// ═══════════════════════════════════════════
// AppShell — header/footer + AuthGate wrapper
// ═══════════════════════════════════════════
// Header/footer are hidden on auth pages — avoids unnecessary UI noise
// for the full-bleed brand layout.

const AUTH_ROUTES_PREFIX = ["/sign-in", "/sign-up", "/forgot-password", "/reset-password"];

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const isAuthRoute = AUTH_ROUTES_PREFIX.some((p) => pathname.startsWith(p));

  if (isAuthRoute) {
    // AuthGate still runs — an authenticated user hitting /sign-in
    // gets redirected to /dashboard.
    return (
      <AuthGate>
        <PageTransition>{children}</PageTransition>
      </AuthGate>
    );
  }

  return (
    <>
      <Header />
      <main className="flex-1">
        <AuthGate>
          <PageTransition>{children}</PageTransition>
        </AuthGate>
      </main>
      <Footer />
    </>
  );
}
