"use client";

import { useEffect } from "react";
import { useUser } from "@/hooks/use-user";
import { useJobs } from "@/hooks/use-jobs";
import { UserSelector } from "@/components/profile/user-selector";
import { ProfileForm } from "@/components/profile/profile-form";
import { ProfileSummary } from "@/components/profile/profile-summary";
import { ScoringButton } from "@/components/scoring/scoring-button";
import { ClearJobsButton } from "@/components/profile/clear-jobs-button";

export default function ProfilePage() {
  const { user, users, isLoading, error, createUser, updateUser, selectUser } =
    useUser();
  const { total: jobCount, fetchJobs } = useJobs();

  // User seçildiyse ilan sayısını güncel tut
  useEffect(() => {
    if (user?.id) fetchJobs(user.id);
  }, [user?.id, fetchJobs]);

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
      <ScoringButton userId={user?.id ?? null} unscoredCount={0} />

      {/* İlanları Temizle — ilanı olan kullanıcıya göster */}
      {user && <ClearJobsButton userId={user.id} jobCount={jobCount} />}
    </div>
  );
}
