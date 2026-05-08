"use client";

import { usePathname, useRouter } from "next/navigation";
import { useEffect } from "react";
import { useAuth } from "@/contexts/auth-context";

// ═══════════════════════════════════════════
// AuthGate — global route protection
// ═══════════════════════════════════════════
// Layout'ta children'ı sarar. PUBLIC_ROUTES auth gerektirmez; diğer her yerde
// status === "unauthenticated" ise /sign-in'e yönlendirir.
// "checking" sırasında küçük bir nötr ekran gösteririz; flash'ı engeller.

// Auth gerektirmeyen yollar — landing ("/") ve auth ekranları.
const PUBLIC_ROUTES = new Set<string>([
  "/",
  "/sign-in",
  "/sign-up",
  "/forgot-password",
  "/reset-password",
]);
// Authenticated kullanıcı buralara giderse /dashboard'a yönlendirilir
// (giriş yapmış birinin tekrar login ekranına gitmesinin anlamı yok).
const REDIRECT_AUTHED_AWAY = new Set<string>([
  "/sign-in",
  "/sign-up",
  "/forgot-password",
  "/reset-password",
]);

export function AuthGate({ children }: { children: React.ReactNode }) {
  const { status } = useAuth();
  const pathname = usePathname();
  const router = useRouter();

  const isPublic = PUBLIC_ROUTES.has(pathname);
  const isAuthRoute = REDIRECT_AUTHED_AWAY.has(pathname);

  useEffect(() => {
    if (status === "checking") return;

    if (!isPublic && status === "unauthenticated") {
      const redirect = encodeURIComponent(pathname);
      router.replace(`/sign-in?redirect=${redirect}`);
      return;
    }

    if (status === "authenticated" && isAuthRoute) {
      router.replace("/dashboard");
    }
  }, [status, isPublic, isAuthRoute, pathname, router]);

  // Auth route'ları (sign-in/up/forgot/reset): authed user oraya gelirse
  // form'u FLASH ettirmemek için checking + authenticated durumlarında null
  // döndür; sadece kesinleşmiş "unauthenticated" iken formu render et.
  if (isAuthRoute) {
    if (status === "checking" || status === "authenticated") return null;
    return <>{children}</>;
  }

  // Diğer public sayfalar (landing /) — checking sırasında render edilebilir.
  if (isPublic) return <>{children}</>;

  if (status === "checking") {
    return (
      <div className="flex min-h-[60vh] items-center justify-center text-sm text-muted-foreground">
        <span className="inline-flex items-center gap-2">
          <span className="bg-brand size-2 animate-pulse rounded-full" />
          Hazırlanıyor...
        </span>
      </div>
    );
  }

  if (status === "unauthenticated") return null;

  return <>{children}</>;
}
