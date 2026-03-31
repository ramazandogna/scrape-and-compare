# UI Design Proposal — Scrape & Compare MVP Dashboard

> Referans: namless job board (ekran görüntüleri) + proje veri yapısı
> Tarih: Temmuz 2025

---

## 1. Genel Mimari: 3 Sayfa

```
┌─────────────────────────────────────────────────────────┐
│  HEADER (tüm sayfalarda sabit)                          │
│  Logo: "Scrape & Compare"   [Dashboard] [Eşleşmeler] [Profil] │
└─────────────────────────────────────────────────────────┘

Sayfa 1: /dashboard     → İlan arama + listeleme (ana sayfa)
Sayfa 2: /matches       → AI eşleşme sonuçları
Sayfa 3: /profile       → Kullanıcı profil formu
```

---

## 2. SAYFA 1: Dashboard (Ana Sayfa)

Bu sayfa referans görseldeki "namless" layoutuna benzer: **Hero search + 3 sütunlu grid**.

### 2.1 Hero Search Bar (Üst Bölüm)

```
┌─────────────────────────────────────────────────────────────────────┐
│                                                                     │
│   İş ilanlarını keşfet                                              │
│   Yapay zeka ile en uygun pozisyonları bul                          │
│                                                                     │
│   ┌─────────────────────────────────┐ ┌──────────────┐ ┌─────────┐ │
│   │ 🔍 Frontend Developer, React.. │ │ 📍 Istanbul  │ │   Ara   │ │
│   └─────────────────────────────────┘ └──────────────┘ └─────────┘ │
│                                                                     │
│   32 ilan bulundu · Son tarama: 2 saat önce                         │
│                                                                     │
└─────────────────────────────────────────────────────────────────────┘
```

**Detay:**
- Sol input: `search` parametresi → virgülle ayrılmış birden fazla keyword destekler
  - Placeholder: "Pozisyon ara... (örn: Frontend Developer, React)"
  - Backend'e `?search=Frontend Developer` gider
- Sağ input: `location` parametresi
  - Placeholder: "Lokasyon (örn: Istanbul, Remote)"
- "Ara" butonu: query'yi tetikler, URL'ye yansır (`/dashboard?search=...&location=...`)
- Alt satır: toplam ilan sayısı (`meta.total`) + son scrape zamanı

### 2.2 Ana İçerik: 3 Sütunlu Grid

```
┌──────────────┬──────────────────────────────────────┬──────────────┐
│              │                                      │              │
│   FİLTRELER  │         İLAN KARTLARI               │   SIDEBAR    │
│   (240px)    │         (flex-1)                     │   (280px)    │
│              │                                      │              │
│   Platform   │   ┌──────────────────────────────┐  │  📬 Bülten  │
│   ☑ LinkedIn │   │  Sırala: [Varsayılan ▾]      │  │             │
│   ☐ Indeed   │   │  Tarih ↕ · Maaş ↕ · Skor ↕  │  │  Yeni eşleş-│
│     🔒Yakında│   └──────────────────────────────┘  │  melerden   │
│   ☐ HN Jobs  │                                      │  haberdar   │
│     🔒Yakında│   ┌──────────────────────────────┐  │  ol.        │
│              │   │  🔥 Yüksek Eşleşme          │  │             │
│   ────────── │   │  Linear · Software Engineer  │  │  ┌────────┐ │
│              │   │  📍 Brussels · Full-time     │  │  │ email.. │ │
│   Kıdem      │   │  💰 $50-55k · 📅 29 dk önce │  │  └────────┘ │
│   ○ Hepsi    │   │  Mollit in laborum tempor ... │  │  [Abone Ol] │
│   ○ Junior   │   │  [React] [TS] [Node]          │  │             │
│   ○ Mid      │   │  ⭐ 87/100 eşleşme           │  │  ────────── │
│   ● Senior   │   └──────────────────────────────┘  │             │
│              │                                      │  🚀 Yakında │
│   ────────── │   ┌──────────────────────────────┐  │             │
│              │   │  Notion · Jr UI Designer     │  │  Otomatik   │
│   Maaş Aralığı│  │  📍 Madrid · Full-time       │  │  başvuru     │
│   ○ Hepsi    │   │  💰 $30-32k · 📅 1 gün önce │  │  özelliği   │
│   ○ >30k     │   │  Mollit in laborum tempor ... │  │  geliyor!   │
│   ○ >50k     │   │  [Figma] [CSS]                │  │             │
│   ○ >80k     │   │  ⭐ 42/100 eşleşme           │  │  ────────── │
│   ○ >100k    │   └──────────────────────────────┘  │             │
│              │                                      │  💡 Pro Tip │
│   ────────── │   ┌──────────────────────────────┐  │  Profilinizi│
│              │   │  Spline · Tech Support Eng   │  │  güncel tutun│
│   Eşleşme    │   │  📍 US · Full-time           │  │  daha iyi   │
│   ○ Hepsi    │   │  💰 $50-52k · 📅 1 gün önce │  │  sonuçlar   │
│   ● >50      │   │  [Python] [AWS]               │  │  alın.      │
│   ○ >70      │   │  ⭐ 61/100 eşleşme           │  │             │
│   ○ >80      │   └──────────────────────────────┘  │              │
│              │                                      │              │
│   ────────── │   ┌──────────────────────────────┐  │              │
│              │   │  Loom · Copywriter (Growth)  │  │              │
│   🔒 Otomasyon│  │  ...                          │  │              │
│   ☐ Otomatik │   └──────────────────────────────┘  │              │
│     tarama   │                                      │              │
│     🔒Yakında│   ┌─────────────────────────────┐   │              │
│   ☐ Otomatik │   │  < 1 [2] 3 4 5 >             │   │              │
│     başvur   │   └─────────────────────────────┘   │              │
│     🔒Yakında│                                      │              │
│              │                                      │              │
└──────────────┴──────────────────────────────────────┴──────────────┘
```

### 2.2.1 Sıralama Barı (Sort Bar) — Detay

Kartların hemen üstünde, orta sütunun tam genişliğini kaplayan ince bir sıralama barı:

```
┌──────────────────────────────────────────────────────────────┐
│  Sırala:  [Varsayılan ▾]  │  📅 Tarih ↕  │  💰 Maaş ↕  │  ⭐ Skor ↕  │
└──────────────────────────────────────────────────────────────┘
```

**Davranış:**
- Tıklanmamış halde hepsi nötr (gri)
- İlk tık → artan (↑), ikinci tık → azalan (↓), üçüncü tık → sıralama kaldırılır (varsayılan)
- Aktif sıralama: mavi renk + yön oku belirginleşir
- Aynı anda sadece 1 sıralama aktif olabilir

| Buton | Alan | Artan (↑) | Azalan (↓) |
|-------|------|-----------|------------|
| **Varsayılan** | — | Backend default sırası (`scrapedAt DESC`) | — |
| **📅 Tarih** | `postedDate` / `scrapedAt` | En eski önce | En yeni önce |
| **💰 Maaş** | `salaryMin` | Düşük maaş önce | Yüksek maaş önce |
| **⭐ Skor** | `score` (match) | Düşük skor önce | Yüksek skor önce |

**Uygulama notu:**
- MVP'de client-side sort (zaten tüm veri çekiliyor)
- Maaşı `null` olan ilanlar maaş sıralamasında en sona düşer
- Skoru olmayan ilanlar skor sıralamasında en sona düşer
- Varsayılan buton bir dropdown değil, sadece "sıralamayı sıfırla" butonu

### 2.3 Filtreler (Sol Panel) — Detay

| Filtre Grubu | Seçenekler | Kaynak | Not |
|---|---|---|---|
| **Platform** | ☑ LinkedIn, ☐ Indeed 🔒, ☐ HN Jobs 🔒 | `source` enum | LinkedIn default checked, diğerleri disabled + "Çok Yakında" tooltip |
| **Kıdem** | Hepsi / Junior / Mid / Senior / Lead | `seniorityLevel` | Radio buttons |
| **Çalışma Tipi** | Hepsi / Full-time / Part-time / Remote | `employmentType` | Radio buttons |
| **Maaş Aralığı** | Hepsi / >30k / >50k / >80k / >100k | `salaryMin` | Radio buttons, TRY cinsinden |
| **Eşleşme Skoru** | Hepsi / >50 / >70 / >80 | `score` (matcher) | Sadece puanlanmış ilanlarda göster |
| **🔒 Otomasyon** | ☐ Otomatik tarama / ☐ Otomatik başvur | — | Disabled, "Çok Yakında" badge |

> **Not:** Filtreler şu an client-side. İleride backend'e `?source=LINKEDIN&minSalary=50000&minScore=70` gibi query params eklenir.

### 2.4 İlan Kartı (Job Card) — Detay

```
┌──────────────────────────────────────────────────────┐
│  🔥 Yüksek Eşleşme                        87/100 ⭐ │  ← score >= 80: kırmızı ateş badge
│──────────────────────────────────────────────────────│
│  ┌──────┐  Linear company                            │
│  │ Logo │  Software Engineer                         │  ← title (bold, büyük)
│  │(bgclr)│  📍 Brussels · ⏰ Full-time               │  ← location + employmentType
│  └──────┘  💰 $50-55k · 📅 29 dk önce               │  ← salary + postedDate
│──────────────────────────────────────────────────────│
│  Mollit in laborum tempor Lorem incididunt           │  ← description (max 2 satır, truncate)
│  irure. Aute eu ex ad sunt...                        │
│──────────────────────────────────────────────────────│
│  [React] [TypeScript] [Node.js] [+2]                │  ← skills (max 4 göster, geri kalan +N)
│──────────────────────────────────────────────────────│
│  ✅ React, TypeScript  ❌ GraphQL, Docker            │  ← matchedSkills / missingSkills
│                                          [Detay →]  │  ← İlan detay linki (LinkedIn URL)
└──────────────────────────────────────────────────────┘
```

**Score Badge Renk Kuralları:**

| Skor | Badge | Renk | İkon |
|------|-------|------|------|
| 80-100 | "Yüksek Eşleşme" | Kırmızı/Turuncu gradient | 🔥 |
| 60-79 | "İyi Eşleşme" | Yeşil | ✅ |
| 50-59 | "Orta Eşleşme" | Sarı | ⚡ |
| < 50 veya puansız | Badge yok | — | — |

**Logo Alanı:**
- Şirket logosu çekilemiyor (scraper bunu almıyor)
- Alternatif: Şirket adının baş harfini renkli daire içinde göster
  - Örn: "Linear" → `L` (mor arka plan), "Notion" → `N` (siyah arka plan)
  - Renk: şirket adının hash'ine göre deterministik renk

**Puanlanmamış İlanlar:**
- Score badge gösterilmez
- matchedSkills/missingSkills satırı yerine: "Profilinizi oluşturup puanlama yapın" mesajı
- Profil yoksa kart daha basit görünür (sadece job info)

### 2.5 Sidebar (Sağ Panel) — Detay

```
┌────────────────────────┐
│  📬 Eşleşme Bülteni    │
│                         │
│  Yeni yüksek skorlu     │
│  ilanlardan haberdar    │
│  olun.                  │
│                         │
│  ┌──────────────────┐   │
│  │ email@domain.com │   │
│  └──────────────────┘   │
│  [📧 Abone Ol]         │  ← MVP'de non-functional, sadece UI
│                         │
├─────────────────────────┤
│  🚀 Çok Yakında         │
│                         │
│  ✦ Otomatik iş tarama  │
│  ✦ Otomatik başvuru     │
│  ✦ Indeed entegrasyonu  │
│  ✦ HackerNews Jobs      │
│                         │
│  İlk kullanıcılar       │
│  arasında olmak için     │
│  bültene abone olun!    │
│                         │
├─────────────────────────┤
│  💡 İpucu                │
│                         │
│  Profilinize ne kadar    │
│  çok skill eklerseniz    │
│  eşleşme o kadar doğru  │
│  olur.                   │
│                         │
│  [Profili Düzenle →]    │
└─────────────────────────┘
```

---

## 3. SAYFA 2: Matches (/matches)

Bu sayfa **sadece puanlanmış ilanları** gösterir, skor sırasına göre (en yüksek önce).

```
┌─────────────────────────────────────────────────────────────────────┐
│  AI Eşleşme Sonuçları                                               │
│  32 ilan puanlandı · Ortalama skor: 64 · Son puanlama: 2 saat önce │
│                                                                     │
│  ┌────────────┐                                                     │
│  │ Min. Skor: │  ○ Hepsi  ○ >50  ● >70  ○ >80                      │
│  └────────────┘                                                     │
│                                                                     │
│  ┌─────────────────────────────────────────────────────────────┐    │
│  │ 🔥 92/100 · Senior Frontend Developer · Acme Corp          │    │
│  │ 📍 Istanbul · Full-time · 💰 40-60k TL                     │    │
│  │                                                             │    │
│  │ "React ve TypeScript deneyimi ilanla tam uyumlu.            │    │
│  │  5 yıllık deneyim Senior seviyeye birebir oturuyor."       │    │
│  │                                                             │    │
│  │ ✅ React, TypeScript, Node.js    ❌ GraphQL, Docker         │    │
│  │                                          [LinkedIn'de Gör →]│    │
│  └─────────────────────────────────────────────────────────────┘    │
│                                                                     │
│  ┌─────────────────────────────────────────────────────────────┐    │
│  │ ✅ 78/100 · Full Stack Developer · Startup Inc              │    │
│  │ ...                                                         │    │
│  └─────────────────────────────────────────────────────────────┘    │
│                                                                     │
│  ┌──────────────────────────┐                                       │
│  │  < 1 [2] 3 >             │                                       │
│  └──────────────────────────┘                                       │
└─────────────────────────────────────────────────────────────────────┘
```

**Matches sayfası farkları:**
- Dashboard'daki 3 sütunlu layout yok → tek sütun, full genişlik kartlar
- Her kartta `explanation` alanı prominent gösterilir (AI'ın açıklaması)
- matchedSkills ✅ ve missingSkills ❌ her zaman görünür
- "LinkedIn'de Gör" butonu → `job.url` (yeni sekmede açar)
- Üstte özet istatistik: toplam puanlanan, ortalama skor, son puanlama zamanı

---

## 4. SAYFA 3: Profil (/profile)

```
┌─────────────────────────────────────────────────────────────────────┐
│  👤 Profilim                                                        │
│                                                                     │
│  ┌──────────────────────────────────────────────────────────────┐   │
│  │  Yetenekler (Tech Stack)                                     │   │
│  │  ┌──────────────────────────────────────────────────────┐    │   │
│  │  │ [React ×] [TypeScript ×] [Node.js ×] [+ ekle...]    │    │   │
│  │  └──────────────────────────────────────────────────────┘    │   │
│  │                                                              │   │
│  │  Deneyim Yılı           Tercih Edilen Roller                │   │
│  │  ┌──────────┐           ┌──────────────────────────────┐    │   │
│  │  │ 5        │           │ [Frontend Dev ×] [+ ekle...] │    │   │
│  │  └──────────┘           └──────────────────────────────┘    │   │
│  │                                                              │   │
│  │  Tercih Edilen Lokasyonlar                                  │   │
│  │  ┌──────────────────────────────────────────────────────┐    │   │
│  │  │ [Istanbul ×] [Remote ×] [+ ekle...]                  │    │   │
│  │  └──────────────────────────────────────────────────────┘    │   │
│  │                                                              │   │
│  │  E-posta                                                    │   │
│  │  ┌──────────────────────────────────────────────────────┐    │   │
│  │  │ user@example.com                                      │    │   │
│  │  └──────────────────────────────────────────────────────┘    │   │
│  │                                                              │   │
│  │               [💾 Kaydet]     [🎯 İlanları Puanla]          │   │
│  └──────────────────────────────────────────────────────────────┘   │
│                                                                     │
│  ┌──────────────────────────────────────────────────────────────┐   │
│  │  📊 Profilim Özeti                                           │   │
│  │  Kayıtlı skill: 8 · Deneyim: 5 yıl                         │   │
│  │  Puanlanan ilan: 32 · Ortalama skor: 64                     │   │
│  │  Son puanlama: 2 saat önce                                  │   │
│  └──────────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────────┘
```

**Profil sayfası notları:**
- "Kaydet" → `POST /api/users` (yeni) veya `PATCH /api/users/:id` (güncelleme)
- "İlanları Puanla" → `POST /api/matcher/score` → 202 → toast: "Puanlama başlatıldı!"
- İlk kez giriş: boş form, kaydet sonrası userId localStorage'a yazılır
- Tekrar giriş: form dolu gelir, "Güncelle" butonu

---

## 5. HEADER / NAVIGATION

```
┌─────────────────────────────────────────────────────────────────────┐
│  ● Scrape & Compare          [Dashboard]  [Eşleşmeler]  [Profil]  │
│  AI-Powered Job Matching                                            │
└─────────────────────────────────────────────────────────────────────┘
```

- Aktif sayfa: alt çizgi + bold
- Profil oluşturulmamışsa: "Profil" yanında 🔴 notification dot
- Responsive: mobilde hamburger menu

---

## 6. RENK PALETİ & TASARIM SİSTEMİ

| Kullanım | Renk | Hex |
|----------|------|-----|
| Primary | Mavi (referanstaki gibi) | `#4F6EF7` |
| Score 80+ | Kırmızı-Turuncu gradient | `#FF6B35 → #F72C25` |
| Score 60-79 | Yeşil | `#22C55E` |
| Score 50-59 | Sarı | `#EAB308` |
| Disabled/Locked | Gri | `#9CA3AF` |
| Background | Açık gri | `#F9FAFB` |
| Card bg | Beyaz | `#FFFFFF` |
| Text primary | Koyu | `#111827` |
| Text secondary | Orta gri | `#6B7280` |

**Font:** Inter (system-ui fallback)
**Border radius:** 12px (kartlar), 8px (butonlar/input'lar)
**Shadow:** `0 1px 3px rgba(0,0,0,0.1)` (kartlar)

---

## 7. DİSABLED / "ÇOK YAKINDA" ÖZELLİKLER

Gelecek özellikler UI'da görünür ama kullanılamaz — hype yaratır:

| Özellik | Konum | Görünüm |
|---------|-------|---------|
| Indeed platform | Sol filtre | ☐ checkbox + 🔒 + "Çok Yakında" badge (gri) |
| HackerNews Jobs | Sol filtre | ☐ checkbox + 🔒 + "Çok Yakında" badge (gri) |
| Otomatik tarama | Sol filtre alt | ☐ checkbox + 🔒 + tooltip: "Cron ile otomatik scrape" |
| Otomatik başvur | Sol filtre alt | ☐ checkbox + 🔒 + tooltip: "1-click apply" |
| Email bülteni | Sağ sidebar | Input + buton (non-functional, toast: "Çok yakında!") |
| CV Upload | Profil sayfası | "Upload your resume" CTA (non-functional) |

---

## 8. RESPONSIVE BREAKPOINTS

| Ekran | Layout |
|-------|--------|
| Desktop (>1280px) | 3 sütun: filtreler + kartlar + sidebar |
| Tablet (768-1279px) | 2 sütun: kartlar + sidebar (filtreler drawer olur) |
| Mobile (<768px) | 1 sütun: kartlar (filtreler + sidebar sheet/modal) |

---

## 9. KULLANICI AKIŞI (USER FLOW)

```
İlk Ziyaret
    │
    ▼
/profile → Profil oluştur (skills, deneyim, lokasyon)
    │
    ▼
"Kaydet" → POST /api/users → userId alınır → localStorage
    │
    ▼
/dashboard → 32 ilan listelenir (henüz puansız)
    │
    ▼
"İlanları Puanla" butonu (profil sayfasında veya dashboard'da)
    │
    ▼
POST /api/matcher/score → 202 → Toast: "4 batch kuyruğa eklendi"
    │
    ▼
~15-30 sn bekle (BullMQ arka planda Gemini çağırıyor)
    │
    ▼
/matches → Puanlanmış ilanlar skor sırasında
    │         🔥 Yüksek eşleşmeler yukarıda
    │
    ▼
"LinkedIn'de Gör" → Orijinal ilan sayfası (yeni sekme)
```

---

## 10. COMPONENT HİYERARŞİSİ

```
app/
├── layout.tsx              → Header + Navigation
├── dashboard/
│   └── page.tsx            → HeroSearch + 3-column grid
├── matches/
│   └── page.tsx            → Match results list
└── profile/
    └── page.tsx            → Profile form

components/
├── layout/
│   ├── Header.tsx          → Logo + nav links + notification dot
│   └── MobileNav.tsx       → Hamburger menu (sheet)
├── dashboard/
│   ├── HeroSearch.tsx      → Search input + location + button
│   ├── FilterSidebar.tsx   → Platform, kıdem, maaş, skor filtreleri
│   ├── SortBar.tsx         → Tarih/Maaş/Skor sıralama toggle butonları
│   ├── JobCard.tsx         → Tek ilan kartı
│   ├── JobCardList.tsx     → Kart listesi + SortBar + pagination
│   ├── ScoreBadge.tsx      → 🔥/✅/⚡ skor badge
│   ├── CompanyAvatar.tsx   → Baş harf + deterministik renk
│   ├── SkillTags.tsx       → [React] [TS] [+2] etiketleri
│   └── RightSidebar.tsx    → Bülten + yakında + ipucu
├── matches/
│   ├── MatchCard.tsx       → Genişletilmiş match kartı + explanation
│   └── MatchStats.tsx      → Özet istatistikler
├── profile/
│   ├── ProfileForm.tsx     → Tüm input'lar + kaydet
│   ├── TagInput.tsx        → Skills/roles/locations için tag input
│   └── ProfileSummary.tsx  → Profil özet istatistikleri
└── ui/                     → Shadcn/UI primitives (Button, Input, Card, Badge, etc.)

hooks/
├── useJobs.ts              → GET /api/jobs fetch + state
├── useMatchResults.ts      → GET /api/matcher/results/:userId fetch
├── useUser.ts              → User CRUD + localStorage
└── useScoring.ts           → POST /api/matcher/score + polling

lib/
├── api.ts                  → fetch wrapper (NEXT_PUBLIC_API_URL)
└── utils.ts                → formatSalary, timeAgo, hashColor, etc.
```

---

## 11. VERİ AKIŞI & API MAPPING

| UI Bileşeni | API Endpoint | Veri |
|---|---|---|
| HeroSearch | `GET /api/jobs?search=...&location=...` | `PaginatedJobs` |
| JobCard | — (jobs response'undan) | `JobListingDto` |
| ScoreBadge | — (match join ile) | `MatchResult.score` |
| MatchCard | `GET /api/matcher/results/:userId` | `MatchResultDto` |
| ProfileForm kaydet | `POST /api/users` | `User` |
| ProfileForm güncelle | `PATCH /api/users/:id` | `User` |
| Puanlama tetikle | `POST /api/matcher/score` | `ScoreTriggerResponse (202)` |
| Pagination | `?page=2&limit=10` | `meta.totalPages` |

---

## 12. KESİNLEŞMİŞ KARARLAR

### ✅ Karar 1: Tüm ilanları göster (Opsiyon A)
Puanlanmamış ilanlar badge'siz listelenir. Kullanıcı boş sayfa görmez, ilgi çekildikten sonra "Profil oluştur → Puanla" akışına yönlendirilir.

### ✅ Karar 2: Client-side filtreleme + sıralama (MVP)
**Neden mantıklı:**
- 32 ilanlık veri seti, ~500'e kadar client-side rahat taşır
- Her filtre tıklamasında network request yok → anında UX
- Backend'e filtre endpoint'i eklemek gereksiz maliyet (şu an `GET /api/jobs` sadece `search`, `location`, `sort=newest|oldest` destekliyor)
- `Array.filter()` + `Array.sort()` ile 32 kayıt ~0.1ms'de işlenir

**Mimari:**
```
GET /api/jobs?limit=100          → Tüm ilanlar (tek istek)
GET /api/matcher/results/:userId → Tüm match sonuçları (tek istek)
                ↓
        Client-side merge (Map<jobId, MatchResult>)
                ↓
        enrichedJobs[] = jobs + match bilgisi
                ↓
    ┌───────────┼────────────┐
    ▼           ▼            ▼
  filter()    sort()     paginate()
    ↓           ↓            ↓
  Ekranda gösterilen kartlar (client pagination)
```

**Filtreleme fonksiyonu (pseudo):**
```typescript
function applyFilters(jobs: EnrichedJob[], filters: Filters): EnrichedJob[] {
  return jobs
    .filter(job => !filters.seniorityLevel || job.seniorityLevel === filters.seniorityLevel)
    .filter(job => !filters.employmentType || job.employmentType === filters.employmentType)
    .filter(job => !filters.minSalary || (job.salaryMin ?? 0) >= filters.minSalary)
    .filter(job => !filters.minScore || (job.match?.score ?? 0) >= filters.minScore)
    .filter(job => !filters.source || job.source === filters.source);
}

function applySort(jobs: EnrichedJob[], sort: SortOption): EnrichedJob[] {
  if (sort.field === 'default') return jobs; // backend sırası
  return [...jobs].sort((a, b) => {
    const valA = a[sort.field] ?? (sort.dir === 'asc' ? Infinity : -Infinity);
    const valB = b[sort.field] ?? (sort.dir === 'asc' ? Infinity : -Infinity);
    return sort.dir === 'asc' ? valA - valB : valB - valA;
  });
}
```

**Backend pagination vs client pagination:**
- MVP: `?limit=100` ile tümünü çek → frontend'de `slice((page-1)*10, page*10)` ile sayfalama
- Bu sayede filtre sonrası pagination doğru çalışır (backend pagination + client filter = bozuk sayfa sayıları)

**Post-MVP geçiş planı (500+ ilan olduğunda):**
- `GET /api/jobs`'a eklenir: `?seniorityLevel=Senior&employmentType=Full-time&minSalary=50000&source=LINKEDIN&sort=salary_desc`
- `GET /api/jobs`'a eklenir: `?userId=xxx` → match bilgisi JOIN ile döner
- Client-side filter/sort kaldırılır, hook'lar backend params'a geçer
- Component interface'leri değişmez (`onFilterChange(filters)` pattern'i korunur)

### ✅ Karar 3: Polling ile puanlama takibi (MVP)
5 sn arayla `GET /api/matcher/results/:userId` çağrılır. 32 ilan / 8'li batch = 4 batch, ~25 sn'de tamamlanır. Toast notification gösterilir. Post-MVP'de SSE/WebSocket.

### ✅ Karar 4: İlan detay sayfası yok (MVP)
Kart üzerindeki özet + "LinkedIn'de Gör" dış linki yeterli. Post-MVP'de `/jobs/:id` eklenebilir.

### ✅ Karar 5: Frontend join (Opsiyon A)
İki paralel API çağrısı → `Map<jobId, MatchResult>` → kartlara merge. Backend'e dokunulmaz.

---

## 13. BACKEND UYUM ANALİZİ

### Mevcut API — Neyi destekliyor?

| Endpoint | Param | Durum |
|----------|-------|-------|
| `GET /api/jobs` | `page`, `limit` | ✅ Var |
| `GET /api/jobs` | `search` (title/company) | ✅ Var |
| `GET /api/jobs` | `location` | ✅ Var |
| `GET /api/jobs` | `sort=newest\|oldest` | ✅ Var (scrapedAt bazlı) |
| `GET /api/matcher/results/:userId` | `page`, `limit` | ✅ Var |
| `GET /api/matcher/results/:userId` | Sabit `score DESC` sıralama | ✅ Var |
| `POST /api/matcher/score` | `userId` (body) | ✅ Var |
| User CRUD | — | ❌ **Hiç yok** |

### Scraper'ın doldurduğu alanlar — Filtrelerde kullanılacaklar

| Alan | Durum | Risk |
|------|-------|------|
| `seniorityLevel` | ⚠️ Nullable — LinkedIn criteria'dan çekiliyor | Bazı ilanlarda boş olabilir → "Bilinmiyor" kategorisi |
| `employmentType` | ⚠️ Nullable — aynı durum | Bazı ilanlarda boş olabilir |
| `salaryMin` / `salaryMax` | ⚠️ Nullable — çoğu ilanda maaş yok | Maaş filtresi az ilana etki eder |
| `source` | ✅ Her zaman dolu | Ama şu an sadece `LINKEDIN`, diğerleri gelecekte |
| `skills` (Json) | ✅ AI-extracted | `{ name, category, isMain }` yapısında |
| `postedDate` | ✅ String ("2 days ago" vb.) | Sıralama için parse etmek gerekebilir |

### MVP'de backend'e eklenmesi gereken TEK şey
- **User CRUD modülü:** `POST /api/users` + `GET /api/users/:id` + `PATCH /api/users/:id`
- Gerisi (filtreleme, sıralama, veri birleştirme) tamamı client-side

---

## 14. TEKNİK NOTLAR

- **Next.js 15** App Router + Server Components (ilk fetch SSR, sonraki client)
- **Tailwind CSS 4** + **Shadcn/UI** component library
- **NEXT_PUBLIC_API_URL** = `http://localhost:4000/api`
- **Auth yok** — MVP tek kullanıcı, userId localStorage'da
- **Tema:** Light mode only (MVP), dark mode Post-MVP
- **SEO:** Dashboard sayfası SSR, diğerleri CSR

---

## 15. İLERLEME HARİTASI (Issue #5 Adımları)

### Adım 5.1: Next.js 15 + Tailwind + Shadcn Setup
- [ ] `apps/web/` oluştur (Next.js 15, App Router)
- [ ] Tailwind CSS 4 + Shadcn/UI kurulumu
- [ ] `pnpm-workspace.yaml`'a `apps/web` ekle
- [ ] `NEXT_PUBLIC_API_URL` env tanımı
- [ ] Layout + Header + Navigation (3 sayfa linki)
- [ ] Boş sayfa iskeletleri: `/dashboard`, `/matches`, `/profile`

### Adım 5.2: Backend User CRUD
- [ ] `apps/backend/src/modules/users/` modülü
- [ ] `POST /api/users` — yeni kullanıcı oluştur
- [ ] `GET /api/users/:id` — kullanıcı bilgisi getir
- [ ] `PATCH /api/users/:id` — kullanıcı güncelle
- [ ] Zod validation schemas (`packages/shared`)
- [ ] Unit testler

### Adım 5.3: Frontend Profil Formu (/profile)
- [ ] `ProfileForm.tsx` — tag input'lar (skills, roles, locations) + email + deneyim yılı
- [ ] `TagInput.tsx` — reusable tag input component
- [ ] `ProfileSummary.tsx` — profil istatistikleri
- [ ] `useUser.ts` hook — CRUD + localStorage userId
- [ ] Kaydet → POST/PATCH → toast notification

### Adım 5.4: Dashboard + İlan Kartları (/dashboard)
- [ ] `HeroSearch.tsx` — search + location input
- [ ] `JobCard.tsx` + `ScoreBadge.tsx` + `CompanyAvatar.tsx` + `SkillTags.tsx`
- [ ] `JobCardList.tsx` — kart listesi + client-side pagination
- [ ] `SortBar.tsx` — tarih/maaş/skor sıralama toggle
- [ ] `FilterSidebar.tsx` — platform, kıdem, çalışma tipi, maaş, skor filtreleri + disabled olanlar
- [ ] `RightSidebar.tsx` — bülten + yakında + ipucu
- [ ] `useJobs.ts` hook — GET /api/jobs + state
- [ ] Client-side merge: jobs + matcher results → enrichedJobs
- [ ] `lib/utils.ts` — formatSalary, timeAgo, hashColor, applyFilters, applySort fonksiyonları

### Adım 5.5: Puanlama Tetikleme
- [ ] "İlanları Puanla" butonu (profil + dashboard)
- [ ] `useScoring.ts` hook — POST /api/matcher/score + 5sn polling
- [ ] Toast: "X batch kuyruğa eklendi" → polling → "Puanlama tamamlandı!"
- [ ] Puanlama sırasında loading state (spinner/progress)

### Adım 5.6: Eşleşme Sonuçları (/matches)
- [ ] `MatchCard.tsx` — genişletilmiş kart + AI explanation
- [ ] `MatchStats.tsx` — toplam puanlanan, ortalama skor, son puanlama
- [ ] `useMatchResults.ts` hook — GET /api/matcher/results/:userId
- [ ] Skor filtresi (Hepsi / >50 / >70 / >80)
- [ ] Client-side pagination

### Adım 5.7: E2E Test + ROADMAP
- [ ] Full flow testi: Profil oluştur → Dashboard gör → Puanla → Matches kontrol et
- [ ] ROADMAP.md güncelle — Phase 3 tamamlandı olarak işaretle
- [ ] Responsive test (desktop/tablet/mobile)

---

### Post-MVP Yol Haritası

| Öncelik | Özellik | Açıklama |
|---------|---------|----------|
| P1 | Backend filtre endpoint'leri | 500+ ilan olduğunda client-side'dan geçiş |
| P2 | Indeed + HN Jobs scraper | Multi-source desteği, `source` filtresi aktif |
| P3 | CV Parser (Module B) | PDF/Text CV'den otomatik profil oluşturma |
| P4 | WebSocket/SSE | Real-time puanlama ilerlemesi |
| P5 | Auth (NextAuth) | Multi-user desteği |
| P6 | Scheduled scraping | Cron ile otomatik tarama |
| P7 | Dark mode | Tema desteği |
| P8 | Email notifications | Yüksek eşleşme bildirimleri |
