"use client";

import { useState } from "react";
import type { FormEvent } from "react";
import { Search, MapPin } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

// ═══════════════════════════════════════════
// HeroSearch — Dashboard üst bölüm (arama barı)
// ═══════════════════════════════════════════
// Keyword + Location search → onSearch callback
// ui-example 2.1'deki wireframe

interface HeroSearchProps {
  onSearch: (search: string, location: string) => void;
  total: number;
  isLoading: boolean;
}

export function HeroSearch({ onSearch, total, isLoading }: HeroSearchProps) {
  const [search, setSearch] = useState("");
  const [location, setLocation] = useState("");

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    onSearch(search, location);
  }

  return (
    <div className="rounded-xl border bg-gradient-to-br from-primary/5 to-primary/10 p-6 sm:p-8">
      <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">
        İş ilanlarını keşfet
      </h1>
      <p className="mt-1 text-sm text-muted-foreground">
        Yapay zeka ile en uygun pozisyonları bul
      </p>

      <form onSubmit={handleSubmit} className="mt-5 flex flex-col gap-2 sm:flex-row">
        <div className="relative flex-1">
          <Search className="absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Pozisyon ara... (örn: Frontend Developer, React)"
            className="pl-8"
          />
        </div>
        <div className="relative sm:w-48">
          <MapPin className="absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={location}
            onChange={(e) => setLocation(e.target.value)}
            placeholder="Lokasyon"
            className="pl-8"
          />
        </div>
        <Button type="submit" disabled={isLoading} className="sm:w-24">
          {isLoading ? "..." : "Ara"}
        </Button>
      </form>

      <p className="mt-3 text-xs text-muted-foreground">
        <span className="font-medium text-foreground">{total}</span> ilan
        bulundu
      </p>
    </div>
  );
}
