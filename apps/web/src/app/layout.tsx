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

// Tema flash önleyici — first-paint öncesi html attr'larını set eder.
// React hydration başlamadan localStorage okuyup .dark class ve data-accent
// niteliğini koyar; aksi halde default mor/light bir flash görünür.
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
      // suppressHydrationWarning gerekir çünkü inline script .dark class'ı
      // server'dan ayrı olarak ekler — React aksi halde hydration hatası verir.
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
