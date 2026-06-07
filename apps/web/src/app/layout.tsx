import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { Toaster } from "@/components/ui/sonner";
import { AppShell } from "@/components/layout/app-shell";
import { AuthProvider } from "@/contexts/auth-context";
import { ThemeProvider } from "@/contexts/theme-context";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Scrape & Compare — AI-Powered Job Matching",
  description:
    "LinkedIn iş ilanlarını tara, yapay zeka ile profiline en uygun pozisyonları bul.",
};

// Theme flash preventer — sets html attrs before first paint.
// Reads localStorage before React hydration and applies .dark class and data-accent
// attribute; otherwise a default purple/light flash appears.
const themeBootstrapScript = `
(function () {
  try {
    var mode = localStorage.getItem('scrape:theme-mode');
    if (!mode) {
      mode = window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
    }
    if (mode === 'dark') document.documentElement.classList.add('dark');
    var accent = localStorage.getItem('scrape:theme-accent') || 'purple';
    document.documentElement.dataset.accent = accent;
  } catch (e) {}
})();
`;

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="tr"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
      // suppressHydrationWarning is required because the inline script adds the .dark class
      // independently of the server — React would otherwise throw a hydration error.
      suppressHydrationWarning
    >
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeBootstrapScript }} />
      </head>
      <body className="min-h-full flex flex-col bg-background text-foreground">
        <ThemeProvider>
          <AuthProvider>
            <AppShell>{children}</AppShell>
            <Toaster richColors position="top-right" />
          </AuthProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
