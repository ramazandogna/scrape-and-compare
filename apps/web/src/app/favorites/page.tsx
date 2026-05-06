"use client";

import Link from "next/link";
import { useEffect, useMemo } from "react";
import { toast } from "sonner";
import { Heart } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { JobCard } from "@/components/dashboard/job-card";
import { ScoringButton } from "@/components/scoring/scoring-button";
import { useFavoriteJobs } from "@/hooks/use-favorite-jobs";
import { useJobs } from "@/hooks/use-jobs";
import { useMatchResults } from "@/hooks/use-match-results";
import { useUser } from "@/hooks/use-user";
import { enrichJobsWithMatches } from "@/lib/job-helpers";

export default function FavoritesPage() {
  const { user, updateUser } = useUser();
  const { jobs, fetchJobs, removeJob } = useJobs();
  const { matches, fetchMatches } = useMatchResults();
  const { favoriteJobIds, isFavorite, toggleFavorite } = useFavoriteJobs(user?.id ?? null);

  useEffect(() => {
    if (!user?.id) return;
    void fetchJobs(user.id);
    void fetchMatches(user.id);
  }, [fetchJobs, fetchMatches, user?.id]);

  const favoriteJobs = useMemo(() => {
    const favoriteSet = new Set(favoriteJobIds);

    return enrichJobsWithMatches(jobs, matches)
      .filter((job) => favoriteSet.has(job.id))
      .sort((left, right) => {
        const leftScore = left.match?.score ?? -1;
        const rightScore = right.match?.score ?? -1;

        if (rightScore !== leftScore) {
          return rightScore - leftScore;
        }

        return new Date(right.scrapedAt).getTime() - new Date(left.scrapedAt).getTime();
      });
  }, [favoriteJobIds, jobs, matches]);

  async function handleAddMissingSkill(skill: string): Promise<boolean> {
    if (!user) return false;

    const normalizedSkill = skill.trim();
    if (!normalizedSkill) return false;

    const hasSkill = user.techStack.some(
      (tech) => tech.toLowerCase() === normalizedSkill.toLowerCase(),
    );
    if (hasSkill) return false;

    const nextTechStack = [...user.techStack, normalizedSkill];
    const updated = await updateUser({ techStack: nextTechStack });

    if (!updated) {
      toast.error("Beceri profile eklenemedi");
      return false;
    }

    toast.success(
      `${normalizedSkill} profiline eklendi. Tam etkisi için favorileri yeniden puanlayabilirsin.`,
    );
    return true;
  }

  async function handleRemoveJob(jobId: string): Promise<void> {
    if (!user?.id) return;
    const removed = await removeJob(user.id, jobId);
    if (removed) {
      toast.success("İlan kaldırıldı");
    }
  }

  return (
    <div className="mx-auto max-w-5xl px-4 py-6 sm:px-6 lg:px-8">
      <div className="flex flex-col gap-4 rounded-3xl border bg-card/80 p-6 shadow-sm sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="flex items-center gap-2 text-sm font-semibold text-rose-600">
            <Heart className="size-4 fill-current" />
            Favori İlanlar
          </p>
          <h1 className="mt-1 text-2xl font-semibold">İlanları biriktir, sonra odaklı çalış</h1>
          <p className="mt-2 max-w-2xl text-sm text-muted-foreground">
            Buradaki liste ürün açısından ayrı bir çalışma havuzu gibi davranır. İstersen sadece favorilerini puanla, istersen dashboard&apos;a dönüp havuzu büyüt.
          </p>
        </div>

        {user && (
          <div className="min-w-[280px]">
            <ScoringButton
              userId={user.id}
              unscoredCount={favoriteJobs.filter((job) => job.match === null).length}
              favoriteJobIds={favoriteJobs.map((job) => job.id)}
              onComplete={() => {
                void fetchMatches(user.id);
              }}
              onProgress={() => {
                void fetchMatches(user.id);
              }}
            />
          </div>
        )}
      </div>

      {!user && (
        <Card className="mt-6">
          <CardContent className="py-10 text-center text-sm text-muted-foreground">
            Favorileri görmek için önce bir kullanıcı seç.
          </CardContent>
        </Card>
      )}

      {user && favoriteJobs.length === 0 && (
        <Card className="mt-6 border-dashed">
          <CardContent className="space-y-3 py-12 text-center">
            <p className="text-lg font-medium">Henüz favori ilan yok</p>
            <p className="text-sm text-muted-foreground">
              Dashboard&apos;daki kalp butonuyla ilgini çeken ilanları burada biriktirebilirsin.
            </p>
            <Button asChild className="cursor-pointer">
              <Link href="/dashboard">Dashboard&apos;a dön</Link>
            </Button>
          </CardContent>
        </Card>
      )}

      {user && favoriteJobs.length > 0 && (
        <div className="mt-6 space-y-3">
          {favoriteJobs.map((job) => (
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
