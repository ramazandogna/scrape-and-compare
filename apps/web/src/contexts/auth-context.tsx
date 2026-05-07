"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { apiFetch, ApiError } from "@/lib/api";
import type { UserDto } from "@/hooks/use-user";

// ═══════════════════════════════════════════
// AuthContext — global auth state
// ═══════════════════════════════════════════
// Backend httpOnly cookie ile token tutar; frontend sadece /auth/me ile
// "kullanıcı kim" sorusunu cevaplar. Login/Signup sonrası cookie set edilir,
// biz hemen profile'i fetch ederiz.

export type AuthStatus = "checking" | "authenticated" | "unauthenticated";

interface AuthContextValue {
  status: AuthStatus;
  user: UserDto | null;
  /** Login sonrası kullanıcıyı set eder + status authenticated */
  setUser: (user: UserDto) => void;
  /** Logout — backend cookie'yi temizler, local state sıfırlar */
  logout: () => Promise<void>;
  /** /auth/me'yi yeniden çağırır (profil güncellemesi sonrası) */
  refresh: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

interface SessionPayload {
  user: { id: string; email: string; name: string };
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUserState] = useState<UserDto | null>(null);
  const [status, setStatus] = useState<AuthStatus>("checking");

  const fetchMe = useCallback(async () => {
    try {
      const profile = await apiFetch<UserDto>("/auth/me");
      setUserState(profile);
      setStatus("authenticated");
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) {
        setUserState(null);
        setStatus("unauthenticated");
      } else {
        // Backend kapalıysa bile login sayfasına gönderelim — sessizce.
        setUserState(null);
        setStatus("unauthenticated");
      }
    }
  }, []);

  useEffect(() => {
    void fetchMe();
  }, [fetchMe]);

  const logout = useCallback(async () => {
    try {
      await apiFetch<{ success: boolean }>("/auth/logout", { method: "POST" });
    } finally {
      setUserState(null);
      setStatus("unauthenticated");
    }
  }, []);

  const setUser = useCallback((nextUser: UserDto) => {
    setUserState(nextUser);
    setStatus("authenticated");
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({ status, user, setUser, logout, refresh: fetchMe }),
    [status, user, setUser, logout, fetchMe],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error("useAuth must be used within AuthProvider");
  }
  return ctx;
}

// ─── Login/Signup helpers ─────────────────────

export async function loginRequest(input: { email: string; password: string }) {
  const res = await apiFetch<SessionPayload>("/auth/login", {
    method: "POST",
    body: JSON.stringify(input),
  });
  return res.user;
}

export async function signupRequest(input: {
  email: string;
  name: string;
  password: string;
}) {
  const res = await apiFetch<SessionPayload>("/auth/signup", {
    method: "POST",
    body: JSON.stringify(input),
  });
  return res.user;
}

export async function forgotPasswordRequest(email: string) {
  return apiFetch<{ message: string; devToken: string | null }>(
    "/auth/forgot-password",
    {
      method: "POST",
      body: JSON.stringify({ email }),
    },
  );
}

export async function resetPasswordRequest(input: {
  token: string;
  password: string;
}) {
  const res = await apiFetch<SessionPayload>("/auth/reset-password", {
    method: "POST",
    body: JSON.stringify(input),
  });
  return res.user;
}
