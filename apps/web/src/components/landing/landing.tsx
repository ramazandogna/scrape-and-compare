"use client";

import Link from "next/link";
import { useEffect, useState, type SVGProps, type ComponentType } from "react";
import {
  Sparkles,
  Target,
  Zap,
  Heart,
  Search,
  Brain,
  ArrowRight,
  Check,
  Crown,
  Gem,
  Mail,
  Quote,
  Filter,
  Wand2,
  Clock,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/contexts/auth-context";

// ═══════════════════════════════════════════
// Landing — public marketing sayfası
// ═══════════════════════════════════════════
// 6 bölüm: Hero, Features, Testimonials, Pricing, About, CTA
// brand-* utility'leri kullandığı için footer'daki accent dot ile mor↔yeşil swap olur.

const CONTACT_EMAIL = "doganrmzn40@gmail.com";

// Kullanıcı authenticated ise CTA'lar /dashboard'a, değilse /sign-up'a gider.
function usePrimaryCta() {
  const { status } = useAuth();
  const authed = status === "authenticated";
  return {
    href: authed ? "/dashboard" : "/sign-up",
    label: authed ? "Dashboard'a git" : "Ücretsiz dene",
    secondary: authed ? null : { href: "/sign-in", label: "Giriş yap" },
  };
}

// ─── Brand SVG glyph'leri ───────────────────
function GithubGlyph(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" {...props}>
      <path d="M12 .5C5.65.5.5 5.65.5 12c0 5.08 3.29 9.39 7.86 10.92.58.11.79-.25.79-.55v-1.92c-3.2.7-3.87-1.54-3.87-1.54-.52-1.34-1.27-1.7-1.27-1.7-1.04-.71.08-.7.08-.7 1.15.08 1.75 1.18 1.75 1.18 1.02 1.75 2.68 1.25 3.34.95.1-.74.4-1.25.72-1.54-2.55-.29-5.24-1.28-5.24-5.69 0-1.26.45-2.29 1.18-3.1-.12-.29-.51-1.46.11-3.05 0 0 .96-.31 3.15 1.18a10.93 10.93 0 0 1 5.74 0c2.18-1.49 3.14-1.18 3.14-1.18.63 1.59.23 2.76.11 3.05.74.81 1.18 1.84 1.18 3.1 0 4.42-2.69 5.4-5.25 5.68.41.36.78 1.06.78 2.14v3.17c0 .31.21.67.8.55 4.56-1.53 7.85-5.85 7.85-10.92C23.5 5.65 18.35.5 12 .5z" />
    </svg>
  );
}
function LinkedinGlyph(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" {...props}>
      <path d="M20.45 20.45h-3.55v-5.57c0-1.33-.02-3.04-1.85-3.04-1.86 0-2.14 1.45-2.14 2.94v5.67H9.36V9h3.41v1.56h.05c.48-.9 1.64-1.85 3.37-1.85 3.6 0 4.27 2.37 4.27 5.45v6.29zM5.34 7.43A2.06 2.06 0 1 1 5.35 3.3a2.06 2.06 0 0 1 0 4.13zM7.12 20.45H3.55V9h3.57v11.45zM22.22 0H1.77C.79 0 0 .77 0 1.72v20.56C0 23.23.79 24 1.77 24h20.45c.98 0 1.78-.77 1.78-1.72V1.72C24 .77 23.2 0 22.22 0z" />
    </svg>
  );
}

export function Landing() {
  return (
    <div className="relative">
      <Hero />
      <Features />
      <Stats />
      <Testimonials />
      <Pricing />
      <About />
      <FinalCTA />
    </div>
  );
}

// ═══════════════════════════════════════════
// HERO — rotating headline + figure + floating CTA
// ═══════════════════════════════════════════

const ROTATING_WORDS = ["uyumlu", "hızlı", "doğru", "kazançlı", "akıllı"] as const;

function Hero() {
  const cta = usePrimaryCta();
  const [wordIndex, setWordIndex] = useState(0);

  useEffect(() => {
    const t = setInterval(() => {
      setWordIndex((i) => (i + 1) % ROTATING_WORDS.length);
    }, 2200);
    return () => clearInterval(t);
  }, []);

  return (
    <section className="bg-brand-gradient-soft relative overflow-hidden border-b">
      {/* Yavaş yüzen blob'lar — hareketli derinlik */}
      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        <div className="bg-brand-200 animate-blob absolute -left-32 -top-32 size-96 rounded-full opacity-50 blur-3xl" />
        <div className="animate-blob-slow absolute -right-32 -bottom-40 size-[28rem] rounded-full bg-[var(--brand-accent-400)]/40 blur-3xl" />
        <div className="bg-brand-100 animate-blob-slow absolute right-1/4 top-1/3 size-40 rounded-full opacity-40 blur-2xl" />
      </div>

      <div className="relative mx-auto max-w-6xl px-4 py-20 sm:px-6 lg:py-28">
        <div className="grid items-center gap-10 lg:grid-cols-[1.15fr_1fr]">
          {/* Sol: copy + CTA */}
          <div>
            <div className="inline-flex items-center gap-2 rounded-full border bg-background/70 px-3 py-1 text-[11px] font-medium text-muted-foreground backdrop-blur">
              <span className="animate-soft-pulse size-1.5 rounded-full bg-emerald-500" />
              AI destekli iş arama · şu an aktif beta
            </div>

            <h1 className="mt-6 text-4xl font-bold leading-[1.05] tracking-tight sm:text-5xl lg:text-6xl">
              Bırak senin için en{" "}
              <span className="relative inline-block align-baseline">
                {/* Aynı anda tek kelime görünür; key değiştikçe kısa fade-up animasyonu */}
                <span
                  key={wordIndex}
                  className="text-brand-gradient inline-block animate-[card-in_360ms_cubic-bezier(0.22,1,0.36,1)_both]"
                >
                  {ROTATING_WORDS[wordIndex]}
                </span>
              </span>{" "}
              işi bulalım.
            </h1>

            <p className="mt-5 max-w-xl text-base text-muted-foreground sm:text-lg">
              Profilini bir kere oluştur; sistem sana özel{" "}
              <strong className="text-foreground">yeni ilanları</strong> tarar,
              AI uyum skoruyla işe yaramazları otomatik eler. Sen sadece doğru
              ilana başvurursun.
            </p>

            <div className="mt-8 flex flex-wrap items-center gap-3">
              <div className="animate-float-cta">
                <Button
                  variant="hero"
                  size="lg"
                  nativeButton={false}
                  className="animate-float-glow h-12 px-7 text-sm font-semibold"
                  render={<Link href={cta.href} />}
                >
                  <Sparkles className="size-4" />
                  {cta.label}
                  <ArrowRight className="size-4" />
                </Button>
              </div>
              {cta.secondary && (
                <Button
                  variant="outline"
                  size="lg"
                  nativeButton={false}
                  className="h-12 px-6 text-sm font-semibold"
                  render={<Link href={cta.secondary.href} />}
                >
                  {cta.secondary.label}
                </Button>
              )}
            </div>

            <p className="mt-4 text-[11px] text-muted-foreground">
              Kart bilgisi yok · 50 ilan / gün ücretsiz · saniyeler içinde başla
            </p>
          </div>

          {/* Sağ: SVG figüran (telifsiz, brand renkli) */}
          <div className="relative hidden lg:block">
            <HeroFigure />
          </div>
        </div>
      </div>
    </section>
  );
}

// SVG figüran — orbiting kartlar + merkezi AI nod. Tüm renkler brand var ile.
function HeroFigure() {
  return (
    <div className="relative mx-auto aspect-square w-full max-w-md">
      {/* Outer ring */}
      <div className="absolute inset-0 rounded-full border-2 border-dashed border-[var(--brand-300)]/40" />
      {/* Mid ring */}
      <div className="absolute inset-8 rounded-full border border-[var(--brand-accent-400)]/30" />
      {/* Inner glow */}
      <div className="bg-brand-gradient absolute inset-1/3 rounded-full opacity-20 blur-2xl" />

      {/* Center node — "AI" */}
      <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2">
        <div className="bg-brand-gradient shadow-brand flex size-24 items-center justify-center rounded-3xl text-white ring-4 ring-white/20">
          <Brain className="size-10" />
        </div>
        <div className="bg-brand-gradient absolute inset-0 -z-10 animate-ping rounded-3xl opacity-20" />
      </div>

      {/* Orbiting badges (CSS counter-rotate so badges stay upright while orbiting) */}
      <div className="animate-orbit absolute inset-0">
        <FloatingChip
          className="absolute left-1/2 top-0 -translate-x-1/2 -translate-y-1/2"
          icon={Search}
          label="Tarama"
        />
        <FloatingChip
          className="absolute right-0 top-1/2 -translate-y-1/2 translate-x-1/2"
          icon={Target}
          label="Skor"
        />
        <FloatingChip
          className="absolute bottom-0 left-1/2 -translate-x-1/2 translate-y-1/2"
          icon={Heart}
          label="Favori"
        />
        <FloatingChip
          className="absolute left-0 top-1/2 -translate-y-1/2 -translate-x-1/2"
          icon={Zap}
          label="Auto"
        />
      </div>
    </div>
  );
}

function FloatingChip({
  className,
  icon: Icon,
  label,
}: {
  className: string;
  icon: ComponentType<SVGProps<SVGSVGElement>>;
  label: string;
}) {
  return (
    <div className={className}>
      {/* counter-rotate: orbit dönerken chip'ler dik kalsın */}
      <div className="animate-orbit [animation-direction:reverse]">
        <div className="border-brand-200/60 dark:border-brand-300/30 inline-flex items-center gap-1.5 rounded-full border bg-card px-3 py-1.5 text-xs font-medium shadow-md">
          <Icon className="text-brand size-3.5" />
          {label}
        </div>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════
// FEATURES — 6 kart (daha önce vardı, korundu)
// ═══════════════════════════════════════════

const FEATURES = [
  {
    icon: Search,
    title: "Akıllı tarama",
    desc: "Keyword + lokasyon ver, sistem 50+ yeni ilanı LinkedIn'den çıkarsın. Sayfalandırma otomatik.",
  },
  {
    icon: Brain,
    title: "AI uyum skoru",
    desc: "Her ilan için 0-100 puan. Eşleşen + eksik beceriler. Neden uygun olduğunu açıklayan AI.",
  },
  {
    icon: Zap,
    title: "Otomatik puanlama",
    desc: "Tarama biter bitmez yeni ilanlar AI ile puanlanır. Sen sadece sonucu açarsın.",
  },
  {
    icon: Heart,
    title: "Favori havuzu",
    desc: "İlgini çekenleri biriktir, sonra sadece favorileri yeniden puanla. Token tasarrufu.",
  },
  {
    icon: Target,
    title: "Eşleşme rozeti",
    desc: "60+ iyi eşleşme, 80+ premium. Kart üstündeki rozetle 1 saniyede karar.",
  },
  {
    icon: Wand2,
    title: "Skill gap aksiyonu",
    desc: "Eksik beceriyi tek tıkla profile ekle, anında yeni skoru gör.",
  },
];

function Features() {
  return (
    <section className="border-b py-16 sm:py-20 lg:py-24">
      <div className="mx-auto max-w-6xl px-4 sm:px-6">
        <div className="mx-auto max-w-2xl text-center">
          <h2 className="text-3xl font-bold tracking-tight sm:text-4xl">
            Bir araç değil,{" "}
            <span className="text-brand-gradient">akıllı bir asistan</span>
          </h2>
          <p className="mt-3 text-sm text-muted-foreground sm:text-base">
            Her özellik, &quot;saatlerce ilan kaydırmaktan&quot; çıkıp
            &quot;hızlı ve doğru başvurmaya&quot; odaklanmak için tasarlandı.
          </p>
        </div>

        <div className="mt-12 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {FEATURES.map((feat, i) => {
            const Icon = feat.icon;
            return (
              <div
                key={feat.title}
                className={`animate-card-in stagger-${Math.min(i + 1, 6)} group rounded-2xl border bg-card p-5 shadow-xs transition-all duration-300 hover:-translate-y-1 hover:shadow-md`}
              >
                <span className="bg-brand-50 text-brand ring-brand-200/60 dark:bg-brand-900/30 dark:text-brand-200 inline-flex size-10 items-center justify-center rounded-xl ring-1 transition-transform group-hover:scale-110">
                  <Icon className="size-5" />
                </span>
                <h3 className="mt-4 text-base font-semibold">{feat.title}</h3>
                <p className="mt-1.5 text-sm leading-relaxed text-muted-foreground">
                  {feat.desc}
                </p>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}

// ═══════════════════════════════════════════
// STATS — 2x2 büyük kart, hover, staggered entrance
// ═══════════════════════════════════════════

const STATS = [
  {
    icon: Filter,
    headline: "İşe yaramayan ilanları otomatik eler",
    detail:
      "Description'ı boş, skill çıkarılamayan ya da senin profiline uzak ilanları kart havuzuna sokmadan filtreleriz.",
  },
  {
    icon: Brain,
    headline: "Her ilan için 0-100 AI uyum skoru",
    detail:
      "Profilindeki teknolojilerle ilanı satır satır karşılaştırır; eşleşen ve eksik becerileri tek tek açıklar.",
  },
  {
    icon: Zap,
    headline: "Tarama bitince puanlama otomatik başlar",
    detail:
      "Yeni ilanlar geldiği anda sistem AI ile puanlamayı kuyruğa atar. Sen iki kere tıklamazsın.",
  },
  {
    icon: Clock,
    headline: "İlan başına ortalama < 2 dakika",
    detail:
      "Tarama + zenginleştirme + puanlama: 50 ilan için ~2 dk. Kahve molasından kısa.",
  },
];

function Stats() {
  return (
    <section className="bg-muted/20 border-b py-16 sm:py-20 lg:py-24">
      <div className="mx-auto max-w-6xl px-4 sm:px-6">
        <div className="mx-auto max-w-2xl text-center">
          <h2 className="text-3xl font-bold tracking-tight sm:text-4xl">
            Sayılarla değil,{" "}
            <span className="text-brand-gradient">faydayla</span>
          </h2>
          <p className="mt-3 text-sm text-muted-foreground sm:text-base">
            &quot;%X şu&quot; demiyoruz. Senin için ne yaptığımızı tek tek
            açıklıyoruz.
          </p>
        </div>

        <div className="mt-12 grid gap-5 sm:grid-cols-2">
          {STATS.map((stat, i) => {
            const Icon = stat.icon;
            return (
              <div
                key={stat.headline}
                className={`animate-card-in stagger-${i + 1} group relative overflow-hidden rounded-3xl border bg-card p-6 shadow-xs transition-all duration-500 ease-out hover:-translate-y-1 hover:scale-[1.02] hover:border-[var(--brand-300)]/60 hover:shadow-lg sm:p-7`}
              >
                {/* Hover'da hafif gradient overlay */}
                <div className="bg-brand-gradient-soft pointer-events-none absolute inset-0 opacity-0 transition-opacity duration-500 group-hover:opacity-100" />

                <div className="relative">
                  <div className="flex items-start gap-4">
                    <span className="bg-brand-50 text-brand ring-brand-200/60 dark:bg-brand-900/30 dark:text-brand-200 inline-flex size-12 shrink-0 items-center justify-center rounded-2xl ring-1 transition-all duration-500 group-hover:scale-110 group-hover:rotate-3">
                      <Icon className="size-6" />
                    </span>
                    <h3 className="text-lg font-bold leading-snug sm:text-xl">
                      {stat.headline}
                    </h3>
                  </div>
                  <p className="mt-4 text-sm leading-relaxed text-muted-foreground">
                    {stat.detail}
                  </p>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}

// ═══════════════════════════════════════════
// TESTIMONIALS — kullanım süresi + hizalanmış isim
// ═══════════════════════════════════════════

const TESTIMONIALS = [
  {
    quote:
      "İlk haftada 3 başvuru, 2 mülakat. Kendim arasaydım o ilanları bulmam 1 ay sürerdi.",
    author: "Mert K.",
    role: "Frontend Developer · 4 yıl",
    usage: "5 gün kullanım",
  },
  {
    quote:
      "Eşleşme skorunu görmek inanılmaz zaman kazandırıyor. 80+ skorlulara odaklanıp gerisini geçiyorum, böylece anlamsız başvurular yapmıyorum ve değerli zamanımdan kazanıyorum.",
    author: "Selin A.",
    role: "Fullstack Engineer · 2 yıl",
    usage: "3 gün kullanım",
  },
  {
    quote:
      "Profilimi güncelledim, otomatik yeniden puanladı, eksik bir beceri eklediğim anda yeni eşleşmeler geldi.",
    author: "Berk D.",
    role: "Junior Backend · 1 yıl",
    usage: "8 gün kullanım",
  },
];

function Testimonials() {
  return (
    <section className="border-b py-16 sm:py-20">
      <div className="mx-auto max-w-6xl px-4 sm:px-6">
        <div className="mx-auto max-w-2xl text-center">
          <h2 className="text-3xl font-bold tracking-tight sm:text-4xl">
            Kullananlar ne diyor?
          </h2>
          <p className="mt-3 text-sm text-muted-foreground">
            Beta kullanıcılarından dönen geri bildirimlerden seçmeler.
          </p>
        </div>

        <div className="mt-12 grid gap-4 lg:grid-cols-3">
          {TESTIMONIALS.map((t, i) => (
            <div
              key={t.author}
              className={`animate-card-in stagger-${i + 1} group flex flex-col rounded-2xl border bg-card p-6 shadow-xs transition-all duration-300 hover:-translate-y-1 hover:shadow-md`}
            >
              <Quote className="text-brand/30 mb-3 size-7 shrink-0" />
              <p className="flex-1 text-sm leading-relaxed text-foreground/90">
                &ldquo;{t.quote}&rdquo;
              </p>

              {/* mt-auto + sabit border-t — quote uzunluğuna bağımsız hizalı */}
              <div className="mt-6 flex items-center gap-3 border-t pt-4">
                <span className="bg-brand-gradient flex size-9 shrink-0 items-center justify-center rounded-full text-sm font-semibold text-white">
                  {t.author.charAt(0)}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold">{t.author}</p>
                  <p className="truncate text-[11px] text-muted-foreground">
                    {t.role}
                  </p>
                </div>
                <span className="text-brand bg-brand-50 dark:bg-brand-900/30 dark:text-brand-200 shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold">
                  {t.usage}
                </span>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

// ═══════════════════════════════════════════
// PRICING (önceki commit'tekiyle aynı)
// ═══════════════════════════════════════════

interface Tier {
  key: "free" | "premium" | "diamond";
  name: string;
  price: string;
  priceLabel: string;
  description: string;
  features: { text: string; soft?: boolean }[];
  cta: string;
  ctaSubject: string;
  highlight?: boolean;
  comingSoon?: boolean;
  icon: typeof Sparkles;
  iconBg: string;
}

const TIERS: Tier[] = [
  {
    key: "free",
    name: "Ücretsiz",
    price: "₺0",
    priceLabel: "/ ay",
    description: "Yeni başlayanlar için yeterli temel paket.",
    icon: Sparkles,
    iconBg:
      "bg-emerald-50 text-emerald-600 ring-emerald-200/60 dark:bg-emerald-900/30 dark:text-emerald-300",
    features: [
      { text: "Günde 1 tarama hakkı" },
      { text: "Tarama başına 50 ilan" },
      { text: "3 favori ilan" },
      { text: "Manuel AI puanlama" },
    ],
    cta: "Ücretsiz başla",
    ctaSubject: "Free plan",
  },
  {
    key: "premium",
    name: "Premium",
    price: "₺149",
    priceLabel: "/ ay",
    description: "Aktif arayanlar için akıllı otomasyonlar.",
    icon: Crown,
    iconBg: "bg-brand-gradient text-white",
    features: [
      { text: "Sınırsız manuel tarama" },
      { text: "Tarama başına 150+ ilan" },
      { text: "Sınırsız favori" },
      { text: "Otomatik AI puanlama" },
      { text: "Aynı anda 5 ilana başvuru taslağı" },
      { text: "Düzenli periyotlarla otomatik tarama" },
    ],
    cta: "Premium ile başla",
    ctaSubject: "Premium plan",
    highlight: true,
  },
  {
    key: "diamond",
    name: "Diamond",
    price: "₺499",
    priceLabel: "/ ay",
    description: "Tam otomasyon — sen sadece mülakata gir.",
    icon: Gem,
    iconBg:
      "bg-slate-100 text-slate-500 ring-slate-200 dark:bg-slate-800 dark:text-slate-400",
    features: [
      { text: "Premium'un tüm özellikleri" },
      { text: "Otomatik ilan taraması (her gün)", soft: true },
      { text: "AI ile otomatik başvuru", soft: true },
      { text: "Mülakat hazırlık asistanı", soft: true },
      { text: "Maaş pazarlık koçu", soft: true },
    ],
    cta: "Çok yakında",
    ctaSubject: "Diamond plan",
    comingSoon: true,
  },
];

function buildMailto(subject: string): string {
  const body = `Merhaba,\n\n${subject} hakkında bilgi almak istiyorum.\n\n— `;
  return `mailto:${CONTACT_EMAIL}?subject=${encodeURIComponent(`Scrape & Compare — ${subject}`)}&body=${encodeURIComponent(body)}`;
}

function Pricing() {
  return (
    <section id="pricing" className="border-b py-16 sm:py-20 lg:py-24">
      <div className="mx-auto max-w-6xl px-4 sm:px-6">
        <div className="mx-auto max-w-2xl text-center">
          <h2 className="text-3xl font-bold tracking-tight sm:text-4xl">
            Sana uygun paketi <span className="text-brand-gradient">seç</span>
          </h2>
          <p className="mt-3 text-sm text-muted-foreground">
            İhtiyacın kadar başla, büyüdükçe yükselt. Premium için iletişime
            geç, beta erişimi açıyoruz.
          </p>
        </div>

        <div className="mt-12 grid gap-4 lg:grid-cols-3">
          {TIERS.map((tier) => (
            <PricingCard key={tier.key} tier={tier} />
          ))}
        </div>
      </div>
    </section>
  );
}

function PricingCard({ tier }: { tier: Tier }) {
  const Icon = tier.icon;

  return (
    <div
      className={`relative flex flex-col rounded-2xl border bg-card p-6 shadow-xs transition-all duration-300 ${
        tier.highlight
          ? "border-brand-300 shadow-brand lg:-translate-y-2"
          : "hover:-translate-y-1 hover:shadow-md"
      } ${tier.comingSoon ? "opacity-90" : ""}`}
    >
      {tier.highlight && (
        <span className="bg-brand-gradient absolute -top-3 left-1/2 -translate-x-1/2 rounded-full px-3 py-1 text-[10px] font-semibold uppercase tracking-wider text-white">
          En popüler
        </span>
      )}
      {tier.comingSoon && (
        <span className="absolute -top-3 left-1/2 -translate-x-1/2 rounded-full border border-amber-300 bg-amber-50 px-3 py-1 text-[10px] font-semibold uppercase tracking-wider text-amber-700">
          Yakında
        </span>
      )}

      <div className="flex items-start justify-between gap-3">
        <span
          className={`flex size-10 items-center justify-center rounded-xl ring-1 ${tier.iconBg}`}
        >
          <Icon className="size-5" />
        </span>
      </div>

      <h3 className="mt-4 text-xl font-bold">{tier.name}</h3>
      <p className="mt-1 text-sm text-muted-foreground">{tier.description}</p>

      <div className="mt-5 flex items-baseline gap-1">
        <span className="text-4xl font-bold tracking-tight">{tier.price}</span>
        <span className="text-sm text-muted-foreground">{tier.priceLabel}</span>
      </div>

      <ul className="mt-6 flex-1 space-y-2.5 text-sm">
        {tier.features.map((feat) => (
          <li
            key={feat.text}
            className={`flex items-start gap-2 ${
              feat.soft ? "text-muted-foreground/60" : "text-foreground/90"
            }`}
          >
            <Check
              className={`mt-0.5 size-4 shrink-0 ${
                feat.soft ? "text-muted-foreground/40" : "text-brand"
              }`}
            />
            <span className="leading-snug">{feat.text}</span>
          </li>
        ))}
      </ul>

      <div className="mt-6">
        {tier.comingSoon ? (
          <Button
            variant="outline"
            disabled
            className="w-full cursor-not-allowed"
          >
            {tier.cta}
          </Button>
        ) : tier.key === "free" ? (
          <Button
            variant={tier.highlight ? "hero" : "default"}
            nativeButton={false}
            className="w-full"
            render={<Link href="/sign-up" />}
          >
            {tier.cta}
            <ArrowRight className="size-4" />
          </Button>
        ) : (
          <Button
            variant={tier.highlight ? "hero" : "default"}
            nativeButton={false}
            className="w-full"
            render={<a href={buildMailto(tier.ctaSubject)} />}
          >
            {tier.cta}
            <ArrowRight className="size-4" />
          </Button>
        )}
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════
// ABOUT — biz kimiz + linkler
// ═══════════════════════════════════════════

function About() {
  return (
    <section id="contact" className="bg-muted/20 border-b py-16 sm:py-20">
      <div className="mx-auto max-w-5xl px-4 sm:px-6">
        <div className="grid gap-8 lg:grid-cols-[1fr_1fr] lg:items-center">
          <div>
            <h2 className="text-3xl font-bold tracking-tight sm:text-4xl">
              Biz <span className="text-brand-gradient">kimiz</span>?
            </h2>
            <p className="mt-3 text-sm leading-relaxed text-muted-foreground sm:text-base">
              Scrape &amp; Compare, frontend dünyasında 4+ yıllık tecrübeyle
              geliştirilen kişisel bir araç olarak başladı; şimdi herkesin
              kullanabileceği bir AI asistanına dönüşüyor. İş arama sürecini
              insancıl ve hızlı yapma derdindeyiz.
            </p>

            <div className="mt-6 flex flex-wrap gap-3">
              <a
                href="https://github.com/ramazandogna"
                target="_blank"
                rel="noopener noreferrer"
                className="group inline-flex items-center gap-2 rounded-xl border bg-card px-4 py-2.5 text-sm font-medium transition-all hover:-translate-y-0.5 hover:border-[#181717] hover:text-[#181717] hover:shadow-md dark:hover:border-white dark:hover:text-white"
              >
                <GithubGlyph className="size-4 transition-colors group-hover:text-[#181717] dark:group-hover:text-white" />
                GitHub
              </a>
              <a
                href="https://www.linkedin.com/in/ramazandogna/"
                target="_blank"
                rel="noopener noreferrer"
                className="group inline-flex items-center gap-2 rounded-xl border bg-card px-4 py-2.5 text-sm font-medium transition-all hover:-translate-y-0.5 hover:border-[#0A66C2] hover:text-[#0A66C2] hover:shadow-md"
              >
                <LinkedinGlyph className="size-4 transition-colors group-hover:text-[#0A66C2]" />
                LinkedIn
              </a>
              <a
                href={buildMailto("İletişim")}
                className="group inline-flex items-center gap-2 rounded-xl border bg-card px-4 py-2.5 text-sm font-medium transition-all hover:-translate-y-0.5 hover:border-emerald-500 hover:text-emerald-600 hover:shadow-md dark:hover:border-emerald-400 dark:hover:text-emerald-400"
              >
                <Mail className="size-4 transition-colors group-hover:text-emerald-600 dark:group-hover:text-emerald-400" />
                İletişime geç
              </a>
            </div>
          </div>

          <div className="bg-brand-gradient-soft border-brand-200/60 dark:border-brand-300/20 relative overflow-hidden rounded-3xl border p-8">
            <div className="absolute -right-10 -top-10 size-40 rounded-full bg-[var(--brand-accent-400)]/30 blur-3xl" />
            <div className="relative">
              <Sparkles className="text-brand size-6" />
              <p className="mt-4 text-lg font-semibold leading-snug">
                &ldquo;İş aramak yorucu olmasın; akıllıca olsun.&rdquo;
              </p>
              <p className="mt-3 text-sm text-muted-foreground">
                Hedefimiz: doğru ilanı bulma sürecini saatlerden dakikalara
                indirmek. Geri bildirim, özellik isteği veya sadece selam için
                kapı açık.
              </p>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

// ═══════════════════════════════════════════
// FINAL CTA — buton hover bug fix
// ═══════════════════════════════════════════

function FinalCTA() {
  const cta = usePrimaryCta();
  return (
    <section className="py-16 sm:py-20">
      <div className="mx-auto max-w-4xl px-4 sm:px-6">
        <div className="bg-brand-gradient relative overflow-hidden rounded-3xl px-6 py-12 text-center text-white shadow-xl sm:px-12 sm:py-16">
          <div className="absolute inset-0 bg-gradient-to-tr from-white/10 via-transparent to-transparent" />
          <div className="relative">
            <h2 className="text-3xl font-bold leading-tight tracking-tight sm:text-4xl">
              İş arama otomatik pilota geçsin.
            </h2>
            <p className="mx-auto mt-3 max-w-xl text-sm text-white/85 sm:text-base">
              Saniyeler içinde hesap aç, profilini gir, ilk taramanı başlat.
              Ücretsiz, kart bilgisi yok.
            </p>
            <div className="mt-7 flex flex-wrap justify-center gap-3">
              {/* Beyaz buton — hover'da hafif şeffaflaşır, hero gradient'i gizlemez.
                  variant=default kullansaydık primary (siyah) hover devreye girerdi → düzeltildi. */}
              <Link
                href={cta.href}
                className="text-brand inline-flex h-12 cursor-pointer items-center justify-center gap-2 rounded-lg bg-white px-7 text-sm font-semibold shadow-md transition-all duration-300 hover:-translate-y-0.5 hover:bg-white/95 hover:shadow-lg active:scale-95"
              >
                <Sparkles className="size-4" />
                {cta.label === "Dashboard'a git" ? "Dashboard" : "Hemen başla"}
              </Link>
              {cta.secondary && (
                <Link
                  href={cta.secondary.href}
                  className="inline-flex h-12 cursor-pointer items-center justify-center rounded-lg border border-white/40 bg-transparent px-6 text-sm font-semibold text-white transition-all duration-300 hover:-translate-y-0.5 hover:bg-white/10 active:scale-95"
                >
                  {cta.secondary.label}
                </Link>
              )}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
