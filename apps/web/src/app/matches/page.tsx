"use client";

import { useEffect, useState, useMemo, useCallback } from "react";
import { useRouter } from "next/navigation";
import { useUser } from "@/hooks/use-user";
import { useMatchResults } from "@/hooks/use-match-results";
import { MatchCard } from "@/components/matches/match-card";
import { ScoreFilter } from "@/components/matches/score-filter";
import { MatchesHeader } from "@/components/matches/matches-header";
import { Pagination } from "@/components/dashboard/pagination";

// ═══════════════════════════════════════════
// Matches Page — AI eşleşme sonuçları
// ═══════════════════════════════════════════
// GET /api/matcher/results/:userId → score desc sıralı
// Filtre: minimum score slider
// Her kart: ScoreBadge, explanation, matched/missing skills, LinkedIn link

const PAGE_SIZE = 10;

export default function MatchesPage() {
  const router = useRouter();
  const { user } = useUser();
  const { matches, isLoading, error, fetchMatches } = useMatchResults();

  const [minScore, setMinScore] = useState(0);
  const [page, setPage] = useState(1);

  // User yoksa profil sayfasına yönlendir
  useEffect(() => {
    if (user === null) {
      router.push("/profile");
    }
  }, [user, router]);

  // Match sonuçlarını çek
  useEffect(() => {
    if (user?.id) fetchMatches(user.id);
  }, [user?.id, fetchMatches]);

  // Filtreleme + pagination
  const filtered = useMemo(
    () => matches.filter((m) => m.score >= minScore),
    [matches, minScore]
  );

  const totalPages = Math.ceil(filtered.length / PAGE_SIZE);
  const paged = useMemo(
    () => filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE),
    [filtered, page]
  );

  const handleScoreChange = useCallback((val: number) => {
    setMinScore(val);
    setPage(1);
  }, []);

  // Profil yoksa loading göster (redirect beklerken)
  if (!user) {
    return (
      <div className="mx-auto max-w-4xl px-4 py-12 text-center">
        <p className="text-muted-foreground">Profil yükleniyor...</p>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-4xl px-4 py-6 sm:px-6 lg:px-8">
      <MatchesHeader total={matches.length} filtered={filtered.length} />

      {/* Score filtre */}
      <ScoreFilter value={minScore} onChange={handleScoreChange} />

      {/* Loading */}
      {isLoading && (
        <div className="mt-8 text-center text-sm text-muted-foreground">
          Eşleşme sonuçları yükleniyor...
        </div>
      )}

      {/* Error */}
      {error && (
        <div className="mt-8 rounded-lg border border-red-200 bg-red-50 p-4 text-center text-sm text-red-700">
          {error}
        </div>
      )}

      {/* No results */}
      {!isLoading && !error && matches.length === 0 && (
        <div className="mt-8 rounded-xl border bg-card p-8 text-center">
          <p className="text-lg font-medium">Henüz eşleşme sonucu yok</p>
          <p className="mt-1 text-sm text-muted-foreground">
            Dashboard&apos;dan ilanları tarayıp &quot;Puanla&quot; butonuyla eşleştirme başlatın.
          </p>
        </div>
      )}

      {/* Match cards */}
      {!isLoading && paged.length > 0 && (
        <div className="mt-6 space-y-4">
          {paged.map((match) => (
            <MatchCard key={match.id} match={match} />
          ))}
        </div>
      )}

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="mt-6">
          <Pagination
            page={page}
            totalPages={totalPages}
            onPageChange={setPage}
          />
        </div>
      )}
    </div>
  );
}
