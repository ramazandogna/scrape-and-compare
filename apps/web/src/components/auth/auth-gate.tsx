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

const PUBLIC_ROUTES = new Set<string>([
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

  useEffect(() => {
    if (status === "checking") return;

    if (!isPublic && status === "unauthenticated") {
      const redirect = encodeURIComponent(pathname);
      router.replace(`/sign-in?redirect=${redirect}`);
      return;
    }

    if (isPublic && status === "authenticated") {
      router.replace("/dashboard");
    }
  }, [status, isPublic, pathname, router]);

  // Public sayfalar için (login/register) checking sırasında bile children'ı
  // göster — auth zaten gerekmiyor.
  if (isPublic) return <>{children}</>;

  if (status === "checking") {
    return (
      <div className="flex min-h-[60vh] items-center justify-center text-sm text-muted-foreground">
        <span className="inline-flex items-center gap-2">
          <span className="size-2 animate-pulse rounded-full bg-violet-500" />
          Hazırlanıyor...
        </span>
      </div>
    );
  }

  if (status === "unauthenticated") return null;

  return <>{children}</>;
}
