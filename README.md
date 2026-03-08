# 🔍 Scrape & Compare — LinkedIn Job Scraper

AI destekli LinkedIn iş ilanı scraper'ı. Playwright stealth ile bot korumasını aşar, paralel tab pool ile hızlı çalışır, skill extraction ve salary parsing ile verileri zenginleştirir.

## ✨ Özellikler

- **Ghost Scraper:** Playwright + Stealth plugin ile LinkedIn bot korumasını bypass eder
- **Resource Blocking:** JS/CSS/Image/Font bloklanır, sadece HTML yüklenir (10x hızlı)
- **Paralel Tab Pool:** N tab aynı anda detay sayfası çeker
- **SSR Parse:** LinkedIn SSR olduğundan scroll/click gerekmez
- **Skill Extraction:** 80+ teknoloji, 8 kategoride (frontend, backend, devops...)
- **Salary Parsing:** TL/USD/EUR parse + aylık TRY'ye normalize
- **Batch + Retry:** Rate limit'e takılınca exponential backoff ile yeniden dener
- **Adaptive Delay:** Çok keyword varsa gecikmeleri otomatik artırır
- **Timestamp Output:** Her çalıştırmada benzersiz dosya adı

## 🛠️ Teknoloji

| Katman | Teknoloji |
|--------|-----------|
| Runtime | Node.js 20+ |
| Dil | TypeScript 5.9 (tsx ile çalıştırma) |
| Scraping | Playwright + playwright-extra + stealth plugin |
| Package Manager | pnpm 10+ |
| Output | JSON (output/ klasörü) |

## 🚀 Kurulum

```bash
# 1. Repoyu klonla
git clone https://github.com/your-username/scrape-and-compare.git
cd scrape-and-compare

# 2. Bağımlılıkları yükle
pnpm install

# 3. Playwright browser'larını yükle
pnpm exec playwright install chromium

# 4. .env dosyasını düzenle
cp .env.example .env
# KEYWORDS, LOCATION vb. ayarla
```

## ⚙️ Konfigürasyon (.env)

```env
# Browser ayarları
HEADLESS=false          # true = arka planda, false = browser görünür (debug)
SLOW_MO=0               # Aksiyon arası yapay gecikme (ms)

# Arama parametreleri
KEYWORDS=Frontend Developer,React Developer    # Virgülle ayrılmış
LOCATION=Turkey

# Scrape limitleri
MAX_JOBS_PER_KEYWORD=50
REQUEST_DELAY_MIN=1000   # ms
REQUEST_DELAY_MAX=3000   # ms

# Detay çekme
FETCH_DETAILS=true       # description + requirements çek
MAX_DETAIL_FETCH=60      # max kaç ilan detaylandırılacak

# Paralel tab sayısı
PARALLEL_TABS=5          # fazla olursa LinkedIn rate limit verir
```

## 📖 Kullanım

```bash
# Fast scraper (önerilen)
pnpm run fast

# Eski scraper (debug/test için)
pnpm run dev
```

Çıktı `output/job-YYYY-MM-DD-HH-MM.json` olarak kaydedilir.

## 📁 Proje Yapısı

```
src/
├── index.fast.ts              # Fast scraper entry point
├── index.ts                   # Eski scraper entry point
├── discover.ts                # HTML analiz aracı (dev tool)
├── models/
│   └── job.model.ts           # Tüm TypeScript interface'leri
├── scraper/
│   ├── browser.manager.ts     # Stealth Chromium yönetimi
│   ├── fast.scraper.ts        # Resource blocking + paralel tab scraper
│   ├── linkedin.scraper.ts    # Eski scraper (JS render + scroll)
│   ├── job.detail.fetcher.ts  # Eski sıralı detay çekici
│   └── network.sniffer.ts     # Network capture (dev tool)
├── extractors/
│   ├── skill.extractor.ts     # Teknoloji/skill çıkarıcı (80+ keyword)
│   └── salary.parser.ts       # Maaş parse + TRY normalize
├── utils/
│   └── helpers.ts             # sleep, randomBetween, logger
└── types/
    └── declarations.d.ts      # Stealth plugin type declarations
```

## 📊 Çıktı Formatı

```json
{
  "scrapeTimestamp": "2025-01-15T14:30:00.000Z",
  "query": {
    "keywords": ["Frontend Developer", "React Developer"],
    "location": "Turkey"
  },
  "totalJobs": 58,
  "jobs": [
    {
      "id": "4123456789",
      "title": "Senior Frontend Developer",
      "company": "TechCorp",
      "location": "İstanbul, Turkey",
      "salary": null,
      "salaryParsed": null,
      "description": "We are looking for...",
      "requirements": ["3+ years React experience", "TypeScript"],
      "skills": [
        { "name": "React", "category": "frontend", "isMain": true },
        { "name": "TypeScript", "category": "frontend", "isMain": true },
        { "name": "Docker", "category": "devops", "isMain": false }
      ],
      "seniorityLevel": "Mid-Senior level",
      "employmentType": "Full-time",
      "link": "https://www.linkedin.com/jobs/view/4123456789",
      "postedDate": "2 days ago",
      "scrapedAt": "2025-01-15T14:30:00.000Z"
    }
  ],
  "errors": []
}
```

## 🏎️ Performans

| Metrik | Eski Scraper | Fast Scraper |
|--------|-------------|-------------|
| Sayfa yükleme | ~3-5sn | ~500ms |
| 58 job + detay | ~5dk+ | ~90sn |
| Resource kullanımı | Tam render | Sadece HTML |
| Paralel çekme | Sıralı (1 tab) | 5 paralel tab |
| Success rate | ~85% | ~95%+ |

## 📋 Patch Notes

### v1.0.0 — İlk Stabil Sürüm

**Yeni Özellikler:**
- ⚡ **Fast Scraper:** Resource blocking + paralel tab pool ile 10x hızlı scraping
- 🧠 **Skill Extraction:** 80+ teknoloji, 8 kategoride otomatik tespit (main/side ayrımı)
- 💰 **Salary Parser:** TL/USD/EUR parse, yıllık→aylık normalize, statik kur çevirisi
- 🔑 **Env-based Keywords:** `.env` dosyasından virgülle ayrılmış keyword desteği
- ⏱️ **Adaptive Delay:** 2'den fazla keyword varsa gecikmeleri 1.5x artırır
- 📂 **Timestamp Output:** `job-YYYY-MM-DD-HH-MM.json` formatında benzersiz dosya adları
- 🛡️ **Stealth Plugin:** Bot korumasını bypass eden Playwright stealth entegrasyonu
- 🔄 **Batch + Retry:** Rate limit'e takılınca exponential backoff (3s→6s) + cooldown (8s)
- 📊 **Detaylı Çıktı:** skills, salaryParsed, requirements, seniorityLevel, employmentType

**Düzeltmeler:**
- 🐛 Stealth plugin placeholder → `puppeteer-extra-plugin-stealth@2.11.2` ile değiştirildi
- 🐛 Job ID parse hatası düzeltildi (regex + data-entity-urn fallback)
- 🐛 tsx/esbuild `__name` bug'ı çözüldü (page.evaluate'da named function yasak)

**Performans:**
- 58 iş ilanı + 58 description + 53 requirements = 91.4 saniye
- 0 hata, %100 description success rate
- Resource blocking: 138KB HTML vs 1.2MB full render

## 📜 Lisans

ISC
