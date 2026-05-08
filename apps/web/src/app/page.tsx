import type { Metadata } from "next";
import { Landing } from "@/components/landing/landing";

export const metadata: Metadata = {
  title: "Scrape & Compare — AI ile sana göre iş bul",
  description:
    "LinkedIn ilanlarını canlı tara, AI ile profile uyumunu skorla, sadece anlamlı eşleşmelere odaklan. 50+ ilan / tarama hedefi, otomatik puanlama, akıllı favoriler.",
};

export default function Home() {
  return <Landing />;
}
