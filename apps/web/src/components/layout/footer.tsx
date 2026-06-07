"use client";

import { Separator } from "@/components/ui/separator";
import { useTheme } from "@/contexts/theme-context";

function GithubGlyph(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" {...props}>
      <path d="M12 .5C5.65.5.5 5.65.5 12c0 5.08 3.29 9.39 7.86 10.92.58.11.79-.25.79-.55v-1.92c-3.2.7-3.87-1.54-3.87-1.54-.52-1.34-1.27-1.7-1.27-1.7-1.04-.71.08-.7.08-.7 1.15.08 1.75 1.18 1.75 1.18 1.02 1.75 2.68 1.25 3.34.95.1-.74.4-1.25.72-1.54-2.55-.29-5.24-1.28-5.24-5.69 0-1.26.45-2.29 1.18-3.1-.12-.29-.51-1.46.11-3.05 0 0 .96-.31 3.15 1.18a10.93 10.93 0 0 1 5.74 0c2.18-1.49 3.14-1.18 3.14-1.18.63 1.59.23 2.76.11 3.05.74.81 1.18 1.84 1.18 3.1 0 4.42-2.69 5.4-5.25 5.68.41.36.78 1.06.78 2.14v3.17c0 .31.21.67.8.55 4.56-1.53 7.85-5.85 7.85-10.92C23.5 5.65 18.35.5 12 .5z" />
    </svg>
  );
}

// ═══════════════════════════════════════════
// Footer — bottom info bar + theme accent toggle
// ═══════════════════════════════════════════
// "Accent dot": small colored circle next to the GitHub link in the footer.
// Color = "click to switch the site to THIS color" — i.e.:
//   purple mode → dot is green (switch to green)
//   green mode  → dot is purple (switch back to purple)

export function Footer() {
  const year = new Date().getFullYear();
  const { accent, toggleAccent } = useTheme();
  const nextLabel = accent === "purple" ? "yeşil" : "mor";
  const dotClasses =
    accent === "purple"
      ? "bg-emerald-500/70 hover:bg-emerald-500 hover:shadow-[0_0_0_4px_rgba(16,185,129,0.2)]"
      : "bg-violet-500/70 hover:bg-violet-500 hover:shadow-[0_0_0_4px_rgba(139,92,246,0.25)]";

  return (
    <footer className="mt-auto border-t bg-muted/30">
      <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8">
        <div className="flex flex-col items-center gap-4 sm:flex-row sm:justify-between">
          {/* Brand */}
          <div className="flex items-center gap-2">
            <span className="text-sm font-semibold tracking-tight">
              Scrape &amp; Compare
            </span>
            <Separator orientation="vertical" className="h-4" />
            <span className="text-xs text-muted-foreground">
              AI-Powered Job Matching
            </span>
          </div>

          {/* Links + Accent dot */}
          <nav className="flex items-center gap-3 text-xs text-muted-foreground">
            <a
              href="https://github.com/ramazandogna/scrape-and-compare"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 transition-colors hover:text-foreground"
            >
              <GithubGlyph className="size-3.5" />
              GitHub
            </a>

            {/* Accent toggle dot — swaps the site theme */}
            <button
              type="button"
              onClick={toggleAccent}
              aria-label={`Site temasını ${nextLabel}e çevir`}
              title={`Tema rengini ${nextLabel}e çevir`}
              className={`relative size-3 cursor-pointer rounded-full transition-all duration-300 active:scale-90 ${dotClasses}`}
            >
              <span className="sr-only">Tema rengini değiştir</span>
            </button>

            <Separator orientation="vertical" className="h-3" />
            <span>v0.1.0</span>
          </nav>
        </div>

        <p className="mt-4 text-center text-[11px] text-muted-foreground/70">
          © {year} Scrape &amp; Compare. Tüm hakları saklıdır. Bu araç yalnızca
          kişisel kullanım içindir.
        </p>
      </div>
    </footer>
  );
}
