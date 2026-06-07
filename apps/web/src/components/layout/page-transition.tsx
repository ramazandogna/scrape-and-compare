"use client";

import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";

// ═══════════════════════════════════════════
// PageTransition — soft fade-in for the App Router
// ═══════════════════════════════════════════
// Each pathname change updates the key → child remounts → animation
// re-triggers. Also adds a small fade on skeleton-to-content transitions,
// softening the jarring switch.

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
