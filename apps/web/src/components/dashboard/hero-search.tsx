"use client";

import { useMemo, useState } from "react";
import type { ComponentProps, KeyboardEvent } from "react";
import { Search, MapPin, Loader2, X } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ScrapeStatus } from "@/components/dashboard/scrape-status";
import type { ScrapeState } from "@/hooks/use-scraper";
import { LINKEDIN_LOCATIONS } from "@/constants/linkedin-locations";

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

const MAX_KEYWORDS = 3;
const MAX_LOCATION_SUGGESTIONS = 8;
type FormSubmitEvent = Parameters<NonNullable<ComponentProps<"form">["onSubmit"]>>[0];
const LOCATION_ALIASES: Record<string, string> = {
  turkiye: "Turkey",
  "turkiye cumhuriyeti": "Turkey",
  "t\u00fcrkiye": "Turkey",
  "t\u00fcrkiye cumhuriyeti": "Turkey",
  japonya: "Japan",
};
const POPULAR_LOCATIONS: string[] = [
  "Istanbul, Turkey",
  "Ankara, Turkey",
  "Izmir, Turkey",
  "London, United Kingdom",
  "Berlin, Germany",
  "Amsterdam, Netherlands",
  "New York, United States",
  "Remote",
];

export function HeroSearch({ onSearch, scrapeState, onScrapeReset, total }: HeroSearchProps) {
  const [keywords, setKeywords] = useState<string[]>([]);
  const [keywordInput, setKeywordInput] = useState("");
  const [location, setLocation] = useState("");
  const [isLocationFocused, setIsLocationFocused] = useState(false);

  const isScraping = scrapeState.phase === "triggering" || scrapeState.phase === "scraping";

  const locationSuggestions = useMemo(() => {
    if (isScraping) return [];

    const query = normalizeLocation(location);
    const aliasEntries = Object.entries(LOCATION_ALIASES).map(([alias, canonical]) => ({
      alias,
      canonical,
    }));

    if (!query) {
      return [...POPULAR_LOCATIONS, "Turkey", "Japan"].slice(0, MAX_LOCATION_SUGGESTIONS);
    }

    const startsWithMatches = LINKEDIN_LOCATIONS.filter((candidate) =>
      normalizeLocation(candidate).startsWith(query)
    );

    const containsMatches = LINKEDIN_LOCATIONS.filter((candidate) => {
      const normalizedCandidate = normalizeLocation(candidate);
      return !normalizedCandidate.startsWith(query) && normalizedCandidate.includes(query);
    });

    const aliasMatches = aliasEntries
      .filter((entry) => entry.alias.startsWith(query) || entry.alias.includes(query))
      .map((entry) => entry.canonical);

    return Array.from(new Set([...startsWithMatches, ...containsMatches, ...aliasMatches])).slice(
      0,
      MAX_LOCATION_SUGGESTIONS,
    );
  }, [isScraping, location]);

  function handleSubmit(e: FormSubmitEvent) {
    e.preventDefault();
    const nextKeywords = addKeywordsFromInput();
    if (!nextKeywords.length) return;

    onSearch(nextKeywords, canonicalizeLocation(location));
  }

  function handleFormKeyDown(e: KeyboardEvent<HTMLFormElement>): void {
    if (e.key === "Enter") {
      e.preventDefault();
    }
  }

  function normalizeKeyword(raw: string): string {
    return raw.trim().toLowerCase().replaceAll(".", "");
  }

  function normalizeLocation(raw: string): string {
    return raw
      .trim()
      .toLowerCase()
      .normalize("NFD")
      .replace(/\p{M}/gu, "")
      .replaceAll(".", "");
  }

  function canonicalizeLocation(raw: string): string {
    const trimmed = raw.trim();
    if (!trimmed) return "";

    const normalized = normalizeLocation(trimmed);
    return LOCATION_ALIASES[normalized] ?? trimmed;
  }

  function addKeywordsFromInput(): string[] {
    const rawChunks = keywordInput.split(",");
    const normalizedChunks = rawChunks
      .map((chunk) => normalizeKeyword(chunk))
      .filter(Boolean);

    let nextKeywords = [...keywords];

    for (const keyword of normalizedChunks) {
      if (nextKeywords.length >= MAX_KEYWORDS) break;
      if (nextKeywords.includes(keyword)) continue;
      nextKeywords = [...nextKeywords, keyword];
    }

    if (nextKeywords.length !== keywords.length) {
      setKeywords(nextKeywords);
    }

    setKeywordInput("");
    return nextKeywords;
  }

  function removeKeyword(keywordToRemove: string): void {
    setKeywords((prev) => prev.filter((keyword) => keyword !== keywordToRemove));
  }

  function handleKeywordKeyDown(e: KeyboardEvent<HTMLInputElement>): void {
    if (e.key === "Enter" || e.key === ",") {
      e.preventDefault();
      addKeywordsFromInput();
    }
  }

  function handleLocationSelect(nextLocation: string): void {
    setLocation(nextLocation);
    setIsLocationFocused(false);
  }

  function shouldShowLocationSuggestions(): boolean {
    return isLocationFocused && locationSuggestions.length > 0 && !isScraping;
  }

  return (
    <div className="rounded-xl border bg-linear-to-br from-primary/5 to-primary/10 p-6 sm:p-8">
      <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">
        İş ilanlarını tara
      </h1>
      <p className="mt-1 text-sm text-muted-foreground">
        LinkedIn&apos;den canlı olarak ilanları çek, yapay zeka ile eşleştir
      </p>

      <form onSubmit={handleSubmit} onKeyDown={handleFormKeyDown} className="mt-5 flex flex-col gap-3">
        <div className="flex items-center justify-between">
          <p className="text-xs text-muted-foreground">Anahtar kelimeler</p>
          <p className="text-xs font-medium text-emerald-700">{keywords.length}/{MAX_KEYWORDS}</p>
        </div>

        {keywords.length > 0 && (
          <div className="flex flex-wrap gap-2">
            {keywords.map((keyword) => (
              <Badge key={keyword} variant="secondary" className="gap-1.5 pr-1">
                {keyword}
                <button
                  type="button"
                  onClick={() => removeKeyword(keyword)}
                  disabled={isScraping}
                  className="rounded-sm p-0.5 text-muted-foreground transition hover:text-foreground disabled:opacity-50"
                  aria-label={`${keyword} anahtar kelimesini sil`}
                >
                  <X className="size-3" />
                </button>
              </Badge>
            ))}
          </div>
        )}

        <div className="flex flex-col gap-2 sm:flex-row">
          <div className="relative flex-1">
            <Search className="absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={keywordInput}
              onChange={(e) => setKeywordInput(e.target.value)}
              onKeyDown={handleKeywordKeyDown}
              onBlur={addKeywordsFromInput}
              placeholder="Keyword yazıp Enter'a bas (orn: frontend developer)"
              className="pl-8"
              disabled={isScraping || keywords.length >= MAX_KEYWORDS}
            />
          </div>

          <div className="relative sm:w-64">
            <MapPin className="absolute left-2.5 top-1/2 z-10 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={location}
              onChange={(e) => setLocation(e.target.value)}
              onFocus={() => setIsLocationFocused(true)}
              onBlur={() => {
                setTimeout(() => {
                  setIsLocationFocused(false);
                }, 120);
              }}
              placeholder="Lokasyon secin veya yazin"
              className="pl-8"
              disabled={isScraping}
            />

            {shouldShowLocationSuggestions() && (
              <div className="absolute z-20 mt-1 max-h-60 w-full overflow-y-auto rounded-md border bg-popover p-1 shadow-md">
                {locationSuggestions.map((suggestion) => (
                  <button
                    key={suggestion}
                    type="button"
                    onMouseDown={(event) => {
                      event.preventDefault();
                      handleLocationSelect(suggestion);
                    }}
                    className="w-full rounded-sm px-2 py-1.5 text-left text-sm text-popover-foreground transition hover:bg-accent"
                  >
                    {suggestion}
                  </button>
                ))}
              </div>
            )}
          </div>

          <Button type="submit" disabled={isScraping || keywords.length === 0} className="sm:w-28">
            {isScraping ? (
              <>
                <Loader2 className="size-4 animate-spin" />
                Taranıyor
              </>
            ) : (
              "Tara"
            )}
          </Button>
        </div>

        <p className="text-xs text-muted-foreground">
          En fazla {MAX_KEYWORDS} keyword ekleyebilirsiniz. Enter veya virgul ile etiket olarak eklenir.
        </p>
        <p className="text-xs text-muted-foreground">
          Lokasyon alaninda LinkedIn odakli 200+ lokasyon arasinda filtreleyerek secim yapabilirsiniz.
        </p>
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
