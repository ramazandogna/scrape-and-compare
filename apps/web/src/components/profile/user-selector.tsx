"use client";

import { UserCircle } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { UserDto } from "@/hooks/use-user";

// ═══════════════════════════════════════════
// UserSelector — DB'deki kullanıcılar arasından seç
// ═══════════════════════════════════════════

interface UserSelectorProps {
  users: UserDto[];
  selectedUserId: string | null;
  onSelect: (userId: string) => void;
}

export function UserSelector({ users, selectedUserId, onSelect }: UserSelectorProps) {
  if (users.length === 0) return null;

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <UserCircle className="size-5" />
          Mevcut Kullanıcılar
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="space-y-1.5">
          {users.map((u) => {
            const isSelected = u.id === selectedUserId;
            return (
              <button
                key={u.id}
                type="button"
                onClick={() => onSelect(u.id)}
                className={`flex w-full items-center gap-3 rounded-lg border px-3 py-2.5 text-left text-sm transition-colors ${
                  isSelected
                    ? "border-primary bg-primary/5 ring-1 ring-primary/20"
                    : "border-transparent bg-muted/40 hover:bg-muted"
                }`}
              >
                <div
                  className={`flex size-8 shrink-0 items-center justify-center rounded-full text-xs font-bold ${
                    isSelected
                      ? "bg-primary text-primary-foreground"
                      : "bg-muted-foreground/20 text-muted-foreground"
                  }`}
                >
                  {u.name.charAt(0).toUpperCase()}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="font-medium truncate">{u.name}</p>
                  <p className="text-xs text-muted-foreground truncate">{u.email}</p>
                </div>
                <div className="text-xs text-muted-foreground shrink-0">
                  {u.techStack.length} skill
                </div>
              </button>
            );
          })}
        </div>
        <p className="mt-3 text-xs text-muted-foreground">
          Bir kullanıcı seçin veya aşağıdan yeni oluşturun.
        </p>
      </CardContent>
    </Card>
  );
}
