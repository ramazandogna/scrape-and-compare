"use client";

import { useState } from "react";
import type { FormEvent } from "react";
import { Search, MapPin, Loader2 } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { ScrapeStatus } from "@/components/dashboard/scrape-status";
import type { ScrapeState } from "@/hooks/use-scraper";

// ═══════════════════════════════════════════
// HeroSearch — Dashboard üst bölüm (arama barı + scrape tetikleme)
// ═══════════════════════════════════════════
// "Ara" → backend'e scrape isteği gönderir (POST /scrape/trigger)
// Scraping devam ederken progress gösterir
// Bitince yeni ilanlar otomatik listelenir

interface HeroSearchProps {
  onSearch: (keywords: string[], location: string) => void;
  scrapeState: ScrapeState;
  onScrapeReset: () => void;
  total: number;
}

export function HeroSearch({ onSearch, scrapeState, onScrapeReset, total }: HeroSearchProps) {
  const [search, setSearch] = useState("");
  const [location, setLocation] = useState("");

  const isScraping = scrapeState.phase === "triggering" || scrapeState.phase === "scraping";

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    const trimmed = search.trim();
    if (!trimmed) return;

    // Virgülle ayrılmış keyword'leri parse et
    const keywords = parseKeywords(trimmed);
    onSearch(keywords, location.trim());
  }

  return (
    <div className="rounded-xl border bg-gradient-to-br from-primary/5 to-primary/10 p-6 sm:p-8">
      <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">
        İş ilanlarını tara
      </h1>
      <p className="mt-1 text-sm text-muted-foreground">
        LinkedIn&apos;den canlı olarak ilanları çek, yapay zeka ile eşleştir
      </p>

      <form onSubmit={handleSubmit} className="mt-5 flex flex-col gap-2 sm:flex-row">
        <div className="relative flex-1">
          <Search className="absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Pozisyon (örn: Frontend Developer, React Developer)"
            className="pl-8"
            disabled={isScraping}
          />
        </div>
        <div className="relative sm:w-48">
          <MapPin className="absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={location}
            onChange={(e) => setLocation(e.target.value)}
            placeholder="Lokasyon"
            className="pl-8"
            disabled={isScraping}
          />
        </div>
        <Button type="submit" disabled={isScraping || !search.trim()} className="sm:w-28">
          {isScraping ? (
            <>
              <Loader2 className="size-4 animate-spin" />
              Taranıyor
            </>
          ) : (
            "Tara"
          )}
        </Button>
      </form>

      {/* Scrape durumu */}
      <ScrapeStatus state={scrapeState} onDismiss={onScrapeReset} />

      {/* Toplam ilan sayısı */}
      <p className="mt-3 text-xs text-muted-foreground">
        <span className="font-medium text-foreground">{total}</span> ilan
        havuzda
      </p>
    </div>
  );
}

// ── Helpers ────────────────────────────────

/** "Frontend Developer, React Developer" → ["Frontend Developer", "React Developer"] */
function parseKeywords(input: string): string[] {
  return input
    .split(",")
    .map((k) => k.trim())
    .filter(Boolean);
}
