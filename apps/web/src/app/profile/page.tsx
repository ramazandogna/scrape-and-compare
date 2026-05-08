"use client";

import { useEffect } from "react";
import { UserCircle2 } from "lucide-react";
import { useUser } from "@/hooks/use-user";
import { useJobs } from "@/hooks/use-jobs";
import { ProfileForm } from "@/components/profile/profile-form";
import { ProfileSummary } from "@/components/profile/profile-summary";
import { ClearJobsButton } from "@/components/profile/clear-jobs-button";

// ═══════════════════════════════════════════
// ProfilePage — kullanıcı profili (düzenle + özet)
// ═══════════════════════════════════════════
// AuthGate buraya gelmeden önce login zorunlu kıldığı için user her zaman var.

export default function ProfilePage() {
  const { user, isLoading, error, updateUser } = useUser();
  const { total: jobCount, fetchJobs } = useJobs();

  useEffect(() => {
    if (user?.id) fetchJobs(user.id);
  }, [user?.id, fetchJobs]);

  if (isLoading || !user) {
    return (
      <div className="mx-auto max-w-3xl space-y-4 px-4 py-8">
        <div className="animate-pulse space-y-4">
          <div className="h-8 w-48 rounded bg-muted" />
          <div className="h-32 rounded-xl bg-muted/70" />
          <div className="h-64 rounded-xl bg-muted/70" />
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-3xl space-y-5 px-4 py-8 sm:px-6">
      <div className="space-y-1.5">
        <div className="inline-flex items-center gap-2 rounded-full border bg-background/70 px-3 py-1 text-[11px] font-medium text-muted-foreground">
          <UserCircle2 className="size-3.5 text-brand" />
          Profil
        </div>
        <h1 className="text-2xl font-bold tracking-tight">
          Sen kimsin, ne arıyorsun?
        </h1>
        <p className="text-sm text-muted-foreground">
          Bilgilerini güncel tut — AI eşleşme kalitesi profil bütünlüğüyle
          doğrudan ilişkili.
        </p>
      </div>

      <ProfileForm key={user.id} user={user} onUpdate={updateUser} error={error} />

      <ProfileSummary user={user} />

      <ClearJobsButton userId={user.id} jobCount={jobCount} />
    </div>
  );
}
