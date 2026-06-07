"use client";

import { usePathname, useRouter } from "next/navigation";
import { useEffect } from "react";
import { useAuth } from "@/contexts/auth-context";

// ═══════════════════════════════════════════
// AuthGate — global route protection
// ═══════════════════════════════════════════
// Wraps children in the layout. PUBLIC_ROUTES require no auth; everywhere else,
// if status === "unauthenticated", redirects to /sign-in.
// During "checking" we render a small neutral screen to prevent a flash.

// Routes that don't require auth — landing ("/") and auth screens.
const PUBLIC_ROUTES = new Set<string>([
  "/",
  "/sign-in",
  "/sign-up",
  "/forgot-password",
  "/reset-password",
]);
// Authenticated users hitting these routes are redirected to /dashboard
// (no point sending a logged-in user back to the login screen).
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

  // Auth routes (sign-in/up/forgot/reset): if an authed user lands here,
  // return null in checking + authenticated states to avoid FLASHing the form;
  // only render the form when status is definitively "unauthenticated".
  if (isAuthRoute) {
    if (status === "checking" || status === "authenticated") return null;
    return <>{children}</>;
  }

  // Other public pages (landing /) — safe to render during checking.
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
