"use client";

import { useUser } from "@/hooks/use-user";
import { UserSelector } from "@/components/profile/user-selector";
import { ProfileForm } from "@/components/profile/profile-form";
import { ProfileSummary } from "@/components/profile/profile-summary";
import { ScoringButton } from "@/components/scoring/scoring-button";

export default function ProfilePage() {
  const { user, users, isLoading, error, createUser, updateUser, selectUser } =
    useUser();

  if (isLoading) {
    return (
      <div className="mx-auto max-w-3xl px-4 py-8">
        <div className="animate-pulse space-y-4">
          <div className="h-8 w-48 rounded bg-muted" />
          <div className="h-64 rounded-xl bg-muted" />
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-3xl space-y-6 px-4 py-8 sm:px-6">
      <h1 className="text-2xl font-bold tracking-tight">Profilim</h1>

      {/* Mevcut kullanıcılar listesi */}
      <UserSelector
        users={users}
        selectedUserId={user?.id ?? null}
        onSelect={selectUser}
      />

      {/* Profil oluştur/düzenle formu */}
      <ProfileForm
        key={user?.id ?? "new"}
        user={user}
        onSave={createUser}
        onUpdate={updateUser}
        error={error}
      />

      {user && <ProfileSummary user={user} />}

      {/* AI Puanlama — profil oluşturulduysa aktif */}
      <ScoringButton userId={user?.id ?? null} />
    </div>
  );
}
