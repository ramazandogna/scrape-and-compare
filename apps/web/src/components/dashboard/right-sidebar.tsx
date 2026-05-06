"use client";

import { toast } from "sonner";
import Link from "next/link";
import { Mail, Lightbulb } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";

// ═══════════════════════════════════════════
// RightSidebar — sticky 2 kart, eşit yapıda
// ═══════════════════════════════════════════
// "Çok Yakında" feature roadmap'ini sidebar'dan çıkardık — beta'da değer
// üretmiyor, kullanıcıyı feature isteyen vaadlerle yormak yerine sade tutuyoruz.
// Bülten kartında "Yakında" rozeti ile non-functional olduğunu açıkça belirtiyoruz.

export function RightSidebar() {
  function handleSubscribe(e: React.FormEvent) {
    e.preventDefault();
    toast.info("Bülten yakında aktif olacak — bilgini kaydetmedik 🙏");
  }

  return (
    <aside className="space-y-3">
      <Card size="sm" className="gap-2">
        <CardHeader>
          <CardTitle className="flex items-center gap-1.5 text-sm">
            <Mail className="size-4 text-violet-600" />
            Eşleşme Bülteni
            <Badge
              variant="outline"
              className="ml-auto h-4 border-amber-300/70 bg-amber-50 px-1.5 text-[10px] font-medium text-amber-700"
            >
              Yakında
            </Badge>
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <p className="text-xs leading-relaxed text-muted-foreground">
            Yüksek skorlu yeni ilanları kaçırmamak için haftalık özet — ilk
            kullanıcılar arasında olmak ister misin?
          </p>
          <form onSubmit={handleSubscribe} className="space-y-2">
            <Input
              placeholder="email@domain.com"
              type="email"
              className="h-9 text-xs"
            />
            <Button
              type="submit"
              variant="outline"
              size="sm"
              className="h-9 w-full text-xs"
            >
              Beni haberdar et
            </Button>
          </form>
        </CardContent>
      </Card>

      <Card size="sm" className="gap-2">
        <CardHeader>
          <CardTitle className="flex items-center gap-1.5 text-sm">
            <Lightbulb className="size-4 text-amber-500" /> İpucu
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <p className="text-xs leading-relaxed text-muted-foreground">
            Profilinde ne kadar çok skill olursa eşleşme o kadar isabetli olur.
            Yeni öğrendiğin bir teknolojiyi unutma.
          </p>
          <Button
            variant="ghost"
            size="sm"
            nativeButton={false}
            className="h-9 w-full text-xs hover:bg-muted/60"
            render={<Link href="/profile" />}
          >
            Profili düzenle →
          </Button>
        </CardContent>
      </Card>
    </aside>
  );
}
