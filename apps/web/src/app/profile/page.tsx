"use client";

import { useUser } from "@/hooks/use-user";
import { ProfileForm } from "@/components/profile/profile-form";
import { ProfileSummary } from "@/components/profile/profile-summary";

export default function ProfilePage() {
  const { user, isLoading, error, createUser, updateUser } = useUser();

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
      <h1 className="text-2xl font-bold tracking-tight">👤 Profilim</h1>

      <ProfileForm
        key={user?.id ?? "new"}
        user={user}
        onSave={createUser}
        onUpdate={updateUser}
        error={error}
      />

      {user && <ProfileSummary user={user} />}
    </div>
  );
}
