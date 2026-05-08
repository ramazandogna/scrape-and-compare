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

  function addKeyword(raw: string): void {
    const normalized = normalizeKeyword(raw);
    if (!normalized) return;
    if (keywords.includes(normalized)) return;
    if (keywords.length >= MAX_KEYWORDS) return;
    setKeywords((prev) => [...prev, normalized]);
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

  const popularKeywords = ["frontend developer", "react developer", "node.js", "fullstack", "devops"];

  return (
    <div className="bg-brand-gradient-soft border-brand-200 dark:border-brand-300/20 relative rounded-3xl border p-6 shadow-sm sm:p-10">
      {/* Glow orb'ları KENDİ overflow-hidden konteynerinde tut, böylece dış
          kart taşan dropdown'ı (lokasyon listesi) kırpmaz. */}
      <div className="pointer-events-none absolute inset-0 overflow-hidden rounded-3xl">
        <div className="bg-brand-100 absolute -right-16 -top-16 size-56 rounded-full opacity-50 blur-3xl" aria-hidden />
        <div className="absolute -bottom-20 -left-12 size-56 rounded-full bg-[var(--brand-accent-400)]/30 blur-3xl" aria-hidden />
      </div>

      <div className="relative">
        <div className="inline-flex items-center gap-2 rounded-full border bg-background/70 px-3 py-1 text-[11px] font-medium text-muted-foreground backdrop-blur">
          <span className="animate-soft-pulse size-1.5 rounded-full bg-emerald-500" />
          AI destekli iş arama
        </div>

        <h1 className="mt-3 text-3xl font-bold leading-tight tracking-tight sm:text-4xl">
          Hangi rolü <span className="text-brand-gradient">arıyorsun?</span>
        </h1>
        <p className="mt-2 max-w-xl text-sm text-muted-foreground sm:text-[15px]">
          3 anahtar kelime, bir lokasyon — gerisini biz hallederiz. Ortalama her tarama
          ~50 yeni ilan + AI ile profil eşleşmesi.
        </p>

        <form onSubmit={handleSubmit} onKeyDown={handleFormKeyDown} className="mt-5 space-y-3">
          {keywords.length > 0 && (
            <div className="flex flex-wrap gap-2">
              {keywords.map((keyword) => (
                <Badge key={keyword} variant="secondary" className="gap-1.5 pr-1">
                  {keyword}
                  <button
                    type="button"
                    onClick={() => removeKeyword(keyword)}
                    disabled={isScraping}
                    className="cursor-pointer rounded-sm p-0.5 text-muted-foreground transition hover:text-foreground disabled:opacity-50"
                    aria-label={`${keyword} anahtar kelimesini sil`}
                  >
                    <X className="size-3" />
                  </button>
                </Badge>
              ))}
            </div>
          )}

          <div className="flex flex-col gap-2 rounded-2xl border bg-background/95 p-2 shadow-sm backdrop-blur sm:flex-row sm:items-center">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={keywordInput}
                onChange={(e) => setKeywordInput(e.target.value)}
                onKeyDown={handleKeywordKeyDown}
                onBlur={addKeywordsFromInput}
                placeholder="Rol veya teknoloji yaz, Enter'a bas"
                className="h-11 border-0 pl-9 text-sm shadow-none focus-visible:ring-0"
                disabled={isScraping || keywords.length >= MAX_KEYWORDS}
              />
            </div>

            <div className="hidden h-8 w-px bg-border sm:block" />

            <div className="relative sm:w-60">
              <MapPin className="absolute left-3 top-1/2 z-10 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={location}
                onChange={(e) => setLocation(e.target.value)}
                onFocus={() => setIsLocationFocused(true)}
                onBlur={() => {
                  setTimeout(() => {
                    setIsLocationFocused(false);
                  }, 120);
                }}
                placeholder="Lokasyon (örn: Istanbul)"
                className="h-11 border-0 pl-9 text-sm shadow-none focus-visible:ring-0"
                disabled={isScraping}
              />

              {shouldShowLocationSuggestions() && (
                <div className="absolute z-20 mt-1 max-h-60 w-full overflow-y-auto rounded-lg border bg-popover p-1 shadow-lg">
                  {locationSuggestions.map((suggestion) => (
                    <button
                      key={suggestion}
                      type="button"
                      onMouseDown={(event) => {
                        event.preventDefault();
                        handleLocationSelect(suggestion);
                      }}
                      className="w-full cursor-pointer rounded-md px-2 py-1.5 text-left text-sm text-popover-foreground transition hover:bg-accent"
                    >
                      {suggestion}
                    </button>
                  ))}
                </div>
              )}
            </div>

            <Button
              type="submit"
              variant="hero"
              disabled={isScraping || keywords.length === 0}
              className="h-11 gap-1.5 px-6 text-sm font-semibold sm:w-auto"
            >
              {isScraping ? (
                <>
                  <Loader2 className="size-4 animate-spin" />
                  Taranıyor
                </>
              ) : (
                <>
                  <Search className="size-4" />
                  Tara
                </>
              )}
            </Button>
          </div>

          <div className="flex flex-wrap items-center gap-1.5 text-xs">
            <span className="text-muted-foreground">Popüler:</span>
            {popularKeywords.map((kw) => (
              <button
                key={kw}
                type="button"
                disabled={isScraping || keywords.length >= MAX_KEYWORDS || keywords.includes(kw)}
                onClick={() => addKeyword(kw)}
                className="cursor-pointer rounded-full border bg-background/60 px-2.5 py-1 text-[11px] text-muted-foreground transition hover:border-primary/40 hover:text-foreground disabled:cursor-not-allowed disabled:opacity-50"
              >
                {kw}
              </button>
            ))}
            <span className="ml-auto text-[11px] text-muted-foreground">
              {keywords.length}/{MAX_KEYWORDS} keyword
            </span>
          </div>
        </form>

        <ScrapeStatus state={scrapeState} onDismiss={onScrapeReset} />

        <p className="mt-4 text-[11px] text-muted-foreground">
          <span className="font-medium text-foreground">{total}</span> ilan havuzda · 200+ lokasyon · ~50 yeni ilan/tarama hedefi
        </p>
      </div>
    </div>
  );
}
