"use client";

import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";

// ═══════════════════════════════════════════
// PageTransition — App Router için yumuşak fade-in
// ═══════════════════════════════════════════
// Pathname her değiştiğinde key değişir → child remount olur → animasyon
// yeniden tetiklenir. Skeleton'dan içeriğe geçişte de küçük bir fade verir,
// "yine bir garip" hissini yumuşatır.

export function PageTransition({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const [renderKey, setRenderKey] = useState(pathname);

  useEffect(() => {
    setRenderKey(pathname);
  }, [pathname]);

  return (
    <div key={renderKey} className="animate-page-in">
      {children}
    </div>
  );
}
