"use client";

import Link from "next/link";
import { useEffect, useMemo } from "react";
import { toast } from "sonner";
import { Sparkles, TrendingUp, Target, LayoutDashboard } from "lucide-react";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { JobCard } from "@/components/dashboard/job-card";
import { ScoringButton } from "@/components/scoring/scoring-button";
import { useFavoriteJobs } from "@/hooks/use-favorite-jobs";
import { useJobs } from "@/hooks/use-jobs";
import { useMatchResults } from "@/hooks/use-match-results";
import { useUser } from "@/hooks/use-user";
import { enrichJobsWithMatches } from "@/lib/job-helpers";

// ═══════════════════════════════════════════
// Matches Page — Yüksek puanlı eşleşmeler (score >= 60)
// ═══════════════════════════════════════════

const MATCH_THRESHOLD = 60;

export default function MatchesPage() {
  const { user, updateUser } = useUser();
  const { jobs, fetchJobs, removeJob } = useJobs();
  const { matches, fetchMatches } = useMatchResults();
  const { isFavorite, toggleFavorite } = useFavoriteJobs(user?.id ?? null);

  useEffect(() => {
    if (!user?.id) return;
    void fetchJobs(user.id);
    void fetchMatches(user.id);
  }, [fetchJobs, fetchMatches, user?.id]);

  const matchedJobs = useMemo(() => {
    return enrichJobsWithMatches(jobs, matches)
      .filter((job) => (job.match?.score ?? 0) >= MATCH_THRESHOLD)
      .sort((a, b) => (b.match?.score ?? 0) - (a.match?.score ?? 0));
  }, [jobs, matches]);

  const avgScore = useMemo(() => {
    if (matchedJobs.length === 0) return null;
    const sum = matchedJobs.reduce((acc, j) => acc + (j.match?.score ?? 0), 0);
    return Math.round(sum / matchedJobs.length);
  }, [matchedJobs]);

  const topScore = useMemo(
    () => matchedJobs[0]?.match?.score ?? null,
    [matchedJobs],
  );

  async function handleAddMissingSkill(skill: string): Promise<boolean> {
    if (!user) return false;
    const normalizedSkill = skill.trim();
    if (!normalizedSkill) return false;
    const hasSkill = user.techStack.some(
      (tech) => tech.toLowerCase() === normalizedSkill.toLowerCase(),
    );
    if (hasSkill) {
      toast.info(`ℹ️ "${normalizedSkill}" zaten profilinde mevcut.`);
      return false;
    }
    const nextTechStack = [...user.techStack, normalizedSkill];
    const updated = await updateUser({ techStack: nextTechStack });
    if (!updated) {
      toast.error("Beceri profile eklenemedi");
      return false;
    }
    toast.success(
      `✅ "${normalizedSkill}" profiline eklendi — kalıcı etki için ilanları yeniden puanlayabilirsin.`,
      { duration: 5000 },
    );
    return true;
  }

  async function handleRemoveJob(jobId: string): Promise<void> {
    if (!user?.id) return;
    const removed = await removeJob(user.id, jobId);
    if (removed) toast.success("İlan kaldırıldı");
  }

  return (
    <div className="mx-auto max-w-5xl px-4 py-6 sm:px-6 lg:px-8">
      {/* Header */}
      <div className="flex flex-col gap-4 rounded-3xl border bg-card/80 p-6 shadow-sm sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="flex items-center gap-2 text-sm font-semibold text-fuchsia-600">
            <Sparkles className="size-4" />
            Eşleşen İlanlar
          </p>
          <h1 className="mt-1 text-2xl font-semibold">Senin için seçilmiş fırsatlar</h1>
          <p className="mt-2 max-w-2xl text-sm text-muted-foreground">
            AI puanlama skoru {MATCH_THRESHOLD} ve üzeri olan ilanlar. Ne kadar yüksekse o kadar iyi eşleşme.
          </p>

          {/* İstatistikler */}
          {matchedJobs.length > 0 && (
            <div className="mt-4 flex flex-wrap gap-4">
              <div className="flex items-center gap-1.5 rounded-xl border bg-background px-3 py-1.5 text-xs">
                <Target className="size-3.5 text-fuchsia-500" />
                <span className="font-semibold">{matchedJobs.length}</span>
                <span className="text-muted-foreground">eşleşme</span>
              </div>
              {avgScore !== null && (
                <div className="flex items-center gap-1.5 rounded-xl border bg-background px-3 py-1.5 text-xs">
                  <TrendingUp className="size-3.5 text-emerald-500" />
                  <span className="font-semibold">Ort. %{avgScore}</span>
                  <span className="text-muted-foreground">skor</span>
                </div>
              )}
              {topScore !== null && (
                <div className="flex items-center gap-1.5 rounded-xl border bg-background px-3 py-1.5 text-xs">
                  <Sparkles className="size-3.5 text-amber-500" />
                  <span className="font-semibold">En yüksek %{topScore}</span>
                </div>
              )}
            </div>
          )}
        </div>

        {user && (
          <div className="min-w-[280px]">
            <ScoringButton
              userId={user.id}
              unscoredCount={enrichJobsWithMatches(jobs, matches).filter((j) => !j.match).length}
              favoriteJobIds={[]}
              onComplete={() => void fetchMatches(user.id)}
              onProgress={() => void fetchMatches(user.id)}
            />
          </div>
        )}
      </div>

      {/* Kullanıcı yok */}
      {!user && (
        <Card className="mt-6">
          <CardContent className="py-10 text-center text-sm text-muted-foreground">
            Eşleşmeleri görmek için önce bir kullanıcı profili oluştur.
          </CardContent>
        </Card>
      )}

      {/* Eşleşme yok — hiç puanlanmamış */}
      {user && matchedJobs.length === 0 && matches.length === 0 && (
        <Card className="mt-6 border-dashed">
          <CardContent className="space-y-3 py-12 text-center">
            <Sparkles className="mx-auto size-10 text-muted-foreground/40" />
            <p className="text-lg font-medium">Henüz eşleşme yok</p>
            <p className="text-sm text-muted-foreground">
              Dashboard&apos;dan ilanları tara ve &quot;İlanları Puanla&quot; ile AI analizi başlat.
            </p>
            <Link href="/dashboard" className={buttonVariants({ className: "cursor-pointer" })}>
              <LayoutDashboard className="size-4" />
              Dashboard&apos;a git
            </Link>
          </CardContent>
        </Card>
      )}

      {/* Puanlama var ama threshold altında */}
      {user && matchedJobs.length === 0 && matches.length > 0 && (
        <Card className="mt-6 border-dashed">
          <CardContent className="space-y-3 py-12 text-center">
            <Target className="mx-auto size-10 text-muted-foreground/40" />
            <p className="text-lg font-medium">%{MATCH_THRESHOLD} üzeri eşleşme bulunamadı</p>
            <p className="text-sm text-muted-foreground">
              {matches.length} ilan puanlandı ancak hiçbiri eşleşme eşiğini geçmedi.
              Profilini güncelleyip yeniden puanlayabilirsin.
            </p>
            <div className="flex justify-center gap-2">
              <Link href="/profile" className={buttonVariants({ variant: "outline", className: "cursor-pointer" })}>Profili güncelle</Link>
              <Link href="/dashboard" className={buttonVariants({ className: "cursor-pointer" })}>Dashboard&apos;a git</Link>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Eşleşme listesi */}
      {user && matchedJobs.length > 0 && (
        <div className="mt-6 space-y-3">
          {matchedJobs.map((job) => (
            <JobCard
              key={job.id}
              job={job}
              onRemove={handleRemoveJob}
              onAddMissingSkill={handleAddMissingSkill}
              isFavorite={isFavorite(job.id)}
              onToggleFavorite={toggleFavorite}
            />
          ))}
        </div>
      )}
    </div>
  );
}
