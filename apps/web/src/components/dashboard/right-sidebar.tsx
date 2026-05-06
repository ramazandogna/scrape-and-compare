"use client";

import { toast } from "sonner";
import Link from "next/link";
import { Mail, Rocket, Lightbulb, Sparkles } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

// ═══════════════════════════════════════════
// RightSidebar — 3 sticky kart, eşit yapıda
// ═══════════════════════════════════════════
// Her kart: küçük header + kompakt content + (varsa) tek primary aksiyon.
// Buton boyutları, paddinler ve typography aynı — kart yükseklikleri içeriğe
// göre büyür ama "form" tutarlı.

const COMING_SOON_FEATURES = [
  "Otomatik iş tarama",
  "Otomatik başvuru",
  "Indeed entegrasyonu",
  "HackerNews Jobs",
] as const;

export function RightSidebar() {
  function handleSubscribe(e: React.FormEvent) {
    e.preventDefault();
    toast.info("Bülten özelliği çok yakında aktif olacak!");
  }

  return (
    <aside className="space-y-3">
      <Card size="sm" className="gap-2">
        <CardHeader>
          <CardTitle className="flex items-center gap-1.5 text-sm">
            <Mail className="size-4 text-primary" /> Eşleşme Bülteni
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <p className="text-xs leading-relaxed text-muted-foreground">
            Yüksek skorlu yeni ilanları kaçırmamak için haftalık özet al.
          </p>
          <form onSubmit={handleSubscribe} className="space-y-2">
            <Input
              placeholder="email@domain.com"
              type="email"
              className="h-8 text-xs"
            />
            <Button type="submit" size="sm" className="h-8 w-full text-xs">
              Abone Ol
            </Button>
          </form>
        </CardContent>
      </Card>

      <Card size="sm" className="gap-2">
        <CardHeader>
          <CardTitle className="flex items-center gap-1.5 text-sm">
            <Rocket className="size-4 text-primary" /> Çok Yakında
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-1.5">
          {COMING_SOON_FEATURES.map((feat) => (
            <p
              key={feat}
              className="flex items-center gap-1.5 text-xs text-muted-foreground"
            >
              <Sparkles className="size-3 shrink-0 text-amber-500" /> {feat}
            </p>
          ))}
        </CardContent>
      </Card>

      <Card size="sm" className="gap-2">
        <CardHeader>
          <CardTitle className="flex items-center gap-1.5 text-sm">
            <Lightbulb className="size-4 text-primary" /> İpucu
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <p className="text-xs leading-relaxed text-muted-foreground">
            Profilinde ne kadar çok skill olursa eşleşme o kadar isabetli olur.
          </p>
          <Button
            variant="outline"
            size="sm"
            nativeButton={false}
            className="h-8 w-full text-xs"
            render={<Link href="/profile" />}
          >
            Profili düzenle →
          </Button>
        </CardContent>
      </Card>
    </aside>
  );
}
