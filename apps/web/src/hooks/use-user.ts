"use client";

import { useCallback, useState } from "react";
import { apiFetch, ApiError } from "@/lib/api";
import { useAuth } from "@/contexts/auth-context";

// ═══════════════════════════════════════════
// useUser — back-compat hook wrapping auth context
// ═══════════════════════════════════════════
// Old API surface: { user, users, isLoading, error, updateUser, selectUser }
// With auth:
//   - user: active user (from auth context)
//   - users: [user] single-element (legacy component compat)
//   - selectUser: noop
//   - createUser: removed (now /sign-up flow)

export interface UserDto {
  id: string;
  email: string;
  name: string;
  techStack: string[];
  experienceYears: number;
  preferredRoles: string[];
  preferredLocations: string[];
  createdAt: string;
  updatedAt: string;
}

export type UpdateUserInput = Partial<
  Pick<
    UserDto,
    | "email"
    | "name"
    | "techStack"
    | "experienceYears"
    | "preferredRoles"
    | "preferredLocations"
  >
>;

interface UseUserReturn {
  user: UserDto | null;
  users: UserDto[];
  isLoading: boolean;
  error: string | null;
  updateUser: (input: UpdateUserInput) => Promise<UserDto | null>;
  selectUser: (userId: string) => void;
}

export function useUser(): UseUserReturn {
  const { user, status, refresh } = useAuth();
  const [error, setError] = useState<string | null>(null);

  const updateUser = useCallback(
    async (input: UpdateUserInput): Promise<UserDto | null> => {
      if (!user) {
        setError("Güncellemek için önce giriş yapmalısın");
        return null;
      }
      setError(null);
      try {
        const updated = await apiFetch<UserDto>(`/users/${user.id}`, {
          method: "PATCH",
          body: JSON.stringify(input),
        });
        await refresh();
        return updated;
      } catch (err) {
        setError(extractErrorMessage(err));
        return null;
      }
    },
    [user, refresh],
  );

  const selectUser = useCallback((_userId: string) => {
    // Kept for legacy signature — with auth there is a single active user.
  }, []);

  return {
    user,
    users: user ? [user] : [],
    isLoading: status === "checking",
    error,
    updateUser,
    selectUser,
  };
}

function extractErrorMessage(err: unknown): string {
  if (err instanceof ApiError) {
    if (err.status === 409) return "Bu email adresi zaten kayıtlı";
    if (err.status === 404) return "Kullanıcı bulunamadı";
    if (err.status === 400) return "Geçersiz form verisi";
    if (err.status === 403) return "Bu işlem için yetkin yok";
    return `Sunucu hatası (${String(err.status)})`;
  }
  return "Bağlantı hatası — backend çalışıyor mu?";
}
