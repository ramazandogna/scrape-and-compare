"use client";

import { usePathname } from "next/navigation";
import { Header } from "@/components/layout/header";
import { Footer } from "@/components/layout/footer";
import { PageTransition } from "@/components/layout/page-transition";
import { AuthGate } from "@/components/auth/auth-gate";

// ═══════════════════════════════════════════
// AppShell — header/footer + AuthGate sarmalayıcı
// ═══════════════════════════════════════════
// Auth sayfalarında header/footer gizlenir — full-bleed brand layout'u için
// gereksiz UI gürültüsü engelleniyor.

const AUTH_ROUTES_PREFIX = ["/sign-in", "/sign-up", "/forgot-password", "/reset-password"];

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const isAuthRoute = AUTH_ROUTES_PREFIX.some((p) => pathname.startsWith(p));

  if (isAuthRoute) {
    // AuthGate yine de çalışır — authenticated kullanıcı /sign-in'e gelirse
    // /dashboard'a yönlendirilir.
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
