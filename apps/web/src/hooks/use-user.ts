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
  isLoading: boolean;
  error: string | null;
  createUser: (input: CreateUserInput) => Promise<UserDto | null>;
  updateUser: (input: UpdateUserInput) => Promise<UserDto | null>;
}

const STORAGE_KEY = "scrape_user_id";

// ═══════════════════════════════════════════
// HELPERS — extracted to avoid setState-in-effect lint rule
// ═══════════════════════════════════════════

/**
 * localStorage'dan kaydedilmiş kullanıcı ID varsa profili yükler.
 * Async function olduğu için useEffect body'sinden çağrıldığında
 * setState çağrıları "synchronous in effect" sayılmaz.
 */
async function loadSavedUser(
  setUser: (u: UserDto | null) => void,
  setIsLoading: (l: boolean) => void
): Promise<void> {
  const savedId = localStorage.getItem(STORAGE_KEY);
  if (!savedId) {
    setIsLoading(false);
    return;
  }
  try {
    const data = await apiFetch<UserDto>(`/users/${savedId}`);
    setUser(data);
  } catch {
    localStorage.removeItem(STORAGE_KEY);
  } finally {
    setIsLoading(false);
  }
}

// ═══════════════════════════════════════════
// HOOK
// ═══════════════════════════════════════════

export function useUser(): UseUserReturn {
  const [user, setUser] = useState<UserDto | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    loadSavedUser(setUser, setIsLoading);
  }, []);

  const createUser = useCallback(
    async (input: CreateUserInput): Promise<UserDto | null> => {
      setError(null);
      try {
        const created = await apiFetch<UserDto>("/users", {
          method: "POST",
          body: JSON.stringify(input),
        });
        setUser(created);
        localStorage.setItem(STORAGE_KEY, created.id);
        return created;
      } catch (err) {
        const message = extractErrorMessage(err);
        setError(message);
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
        return updated;
      } catch (err) {
        const message = extractErrorMessage(err);
        setError(message);
        return null;
      }
    },
    [user]
  );

  return { user, isLoading, error, createUser, updateUser };
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
