"use client";

import { toast } from "sonner";
import Link from "next/link";
import { Mail, Rocket, Lightbulb, Sparkles } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Separator } from "@/components/ui/separator";

// ═══════════════════════════════════════════
// RightSidebar — Sağ panel (bülten + yakında + ipucu)
// ═══════════════════════════════════════════
// MVP'de non-functional: Abone ol → toast gösterir.
// Gelecek özellikleri "hype" olarak listeliyor.

export function RightSidebar() {
  function handleSubscribe(e: React.FormEvent) {
    e.preventDefault();
    toast.info("Bülten özelliği çok yakında aktif olacak!");
  }

  return (
    <aside className="space-y-4">
      {/* Newsletter */}
      <Card size="sm">
        <CardHeader>
          <CardTitle className="text-sm flex items-center gap-1.5"><Mail className="size-4" /> Eşleşme Bülteni</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-xs text-muted-foreground">
            Yeni yüksek skorlu ilanlardan haberdar olun.
          </p>
          <form onSubmit={handleSubscribe} className="mt-3 space-y-2">
            <Input placeholder="email@domain.com" type="email" className="h-8 text-xs" />
            <Button type="submit" size="sm" className="w-full text-xs">
              Abone Ol
            </Button>
          </form>
        </CardContent>
      </Card>

      {/* Coming Soon */}
      <Card size="sm">
        <CardHeader>
          <CardTitle className="text-sm flex items-center gap-1.5"><Rocket className="size-4" /> Çok Yakında</CardTitle>
        </CardHeader>
        <CardContent className="space-y-1.5">
          {[
            "Otomatik iş tarama",
            "Otomatik başvuru",
            "Indeed entegrasyonu",
            "HackerNews Jobs",
          ].map((feat) => (
            <p key={feat} className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <Sparkles className="size-3 shrink-0" /> {feat}
            </p>
          ))}
          <p className="mt-2 text-xs text-muted-foreground italic">
            İlk kullanıcılar arasında olmak için bültene abone olun!
          </p>
        </CardContent>
      </Card>

      <Separator />

      {/* Tip */}
      <Card size="sm">
        <CardHeader>
          <CardTitle className="text-sm flex items-center gap-1.5"><Lightbulb className="size-4" /> İpucu</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-xs text-muted-foreground">
            Profilinize ne kadar çok skill eklerseniz eşleşme o kadar doğru
            olur.
          </p>
          <Button variant="link" size="sm" nativeButton={false} className="mt-2 h-auto p-0 text-xs" render={<Link href="/profile" />}>
            Profili Düzenle →
          </Button>
        </CardContent>
      </Card>
    </aside>
  );
}
