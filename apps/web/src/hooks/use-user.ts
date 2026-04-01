"use client";

import { useState, useEffect, useCallback } from "react";
import { apiFetch, ApiError } from "@/lib/api";

// ═══════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════

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

export interface CreateUserInput {
  email: string;
  name: string;
  techStack?: string[];
  experienceYears?: number;
  preferredRoles?: string[];
  preferredLocations?: string[];
}

export type UpdateUserInput = Partial<CreateUserInput>;

interface UseUserReturn {
  user: UserDto | null;
  users: UserDto[];
  isLoading: boolean;
  error: string | null;
  createUser: (input: CreateUserInput) => Promise<UserDto | null>;
  updateUser: (input: UpdateUserInput) => Promise<UserDto | null>;
  selectUser: (userId: string) => void;
}

const STORAGE_KEY = "scrape_user_id";

// ═══════════════════════════════════════════
// HELPERS — extracted to avoid setState-in-effect lint rule
// ═══════════════════════════════════════════

async function loadInitialData(
  setUser: (u: UserDto | null) => void,
  setUsers: (u: UserDto[]) => void,
  setIsLoading: (l: boolean) => void
): Promise<void> {
  try {
    const allUsers = await apiFetch<UserDto[]>("/users");
    setUsers(allUsers);

    const savedId = localStorage.getItem(STORAGE_KEY);
    if (savedId) {
      const found = allUsers.find((u) => u.id === savedId);
      if (found) {
        setUser(found);
      } else {
        localStorage.removeItem(STORAGE_KEY);
      }
    }
  } catch {
    // Backend'e erişilemezse sessizce devam et
  } finally {
    setIsLoading(false);
  }
}

// ═══════════════════════════════════════════
// HOOK
// ═══════════════════════════════════════════

export function useUser(): UseUserReturn {
  const [user, setUser] = useState<UserDto | null>(null);
  const [users, setUsers] = useState<UserDto[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    loadInitialData(setUser, setUsers, setIsLoading);
  }, []);

  const selectUser = useCallback(
    (userId: string) => {
      const found = users.find((u) => u.id === userId);
      if (found) {
        setUser(found);
        localStorage.setItem(STORAGE_KEY, found.id);
      }
    },
    [users]
  );

  const createUser = useCallback(
    async (input: CreateUserInput): Promise<UserDto | null> => {
      setError(null);
      try {
        const created = await apiFetch<UserDto>("/users", {
          method: "POST",
          body: JSON.stringify(input),
        });
        setUser(created);
        setUsers((prev) => [created, ...prev]);
        localStorage.setItem(STORAGE_KEY, created.id);
        return created;
      } catch (err) {
        setError(extractErrorMessage(err));
        return null;
      }
    },
    []
  );

  const updateUser = useCallback(
    async (input: UpdateUserInput): Promise<UserDto | null> => {
      if (!user) {
        setError("Güncellemek için önce profil oluşturun");
        return null;
      }
      setError(null);
      try {
        const updated = await apiFetch<UserDto>(`/users/${user.id}`, {
          method: "PATCH",
          body: JSON.stringify(input),
        });
        setUser(updated);
        setUsers((prev) =>
          prev.map((u) => (u.id === updated.id ? updated : u))
        );
        return updated;
      } catch (err) {
        setError(extractErrorMessage(err));
        return null;
      }
    },
    [user]
  );

  return { user, users, isLoading, error, createUser, updateUser, selectUser };
}

// ═══════════════════════════════════════════
// HELPERS
// ═══════════════════════════════════════════

function extractErrorMessage(err: unknown): string {
  if (err instanceof ApiError) {
    if (err.status === 409) return "Bu email adresi zaten kayıtlı";
    if (err.status === 404) return "Kullanıcı bulunamadı";
    if (err.status === 400) return "Geçersiz form verisi";
    return `Sunucu hatası (${err.status})`;
  }
  return "Bağlantı hatası — backend çalışıyor mu?";
}
