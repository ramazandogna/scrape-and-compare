import { Separator } from "@/components/ui/separator";

// ═══════════════════════════════════════════
// Footer — Uygulama alt bilgi çubuğu
// ═══════════════════════════════════════════

export function Footer() {
  const year = new Date().getFullYear();

  return (
    <footer className="mt-auto border-t bg-muted/30">
      <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8">
        <div className="flex flex-col items-center gap-4 sm:flex-row sm:justify-between">
          {/* Logo / Brand */}
          <div className="flex items-center gap-2">
            <span className="text-sm font-semibold tracking-tight">
              Scrape & Compare
            </span>
            <Separator orientation="vertical" className="h-4" />
            <span className="text-xs text-muted-foreground">
              AI-Powered Job Matching
            </span>
          </div>

          {/* Links */}
          <nav className="flex items-center gap-4 text-xs text-muted-foreground">
            <a
              href="https://github.com/ramazan/scrape-and-compare"
              target="_blank"
              rel="noopener noreferrer"
              className="transition-colors hover:text-foreground"
            >
              GitHub
            </a>
            <Separator orientation="vertical" className="h-3" />
            <span>v0.1.0</span>
          </nav>
        </div>

        {/* Copyright */}
        <p className="mt-4 text-center text-[11px] text-muted-foreground/70">
          © {year} Scrape & Compare. Tüm hakları saklıdır.
          Bu araç yalnızca kişisel kullanım içindir.
        </p>
      </div>
    </footer>
  );
}
