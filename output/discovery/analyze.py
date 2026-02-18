import re
import json
from html import unescape

# ═══════════════════════════════════════
# SEARCH SAYFASI ANALİZİ
# ═══════════════════════════════════════
html = open("output/discovery/search_page_raw.html", "r").read()
print(f"Search HTML boyutu: {len(html)/1024:.0f}KB\n")

# data-entity-urn = LinkedIn'in iç ID sistemi
urns = re.findall(r'data-entity-urn="([^"]*)"', html)
print(f"data-entity-urn: {len(urns)}")
for u in urns[:5]:
    print(f"  {u}")
print()

# Job title'lar doğrudan HTML'de mi?
titles = re.findall(r'base-search-card__title[^>]*>(.*?)<', html, re.DOTALL)
print(f"Job title bulunan: {len(titles)}")
for t in titles[:5]:
    print(f"  {t.strip()[:80]}")
print()

# Company
companies = re.findall(r'base-search-card__subtitle[^>]*>(.*?)<', html, re.DOTALL)
print(f"Company bulunan: {len(companies)}")
for c in companies[:5]:
    print(f"  {c.strip()[:60]}")
print()

# Jobs URL'leri
job_urls = re.findall(r'href="([^"]*jobs/view[^"]*)"', html)
print(f"Job URL bulunan: {len(job_urls)}")
for u in job_urls[:3]:
    print(f"  {u[:80]}")
print()

# ═══════════════════════════════════════
# JOB DETAY SAYFASI ANALİZİ
# ═══════════════════════════════════════
print("=" * 60)
print("JOB DETAY SAYFASI")
print("=" * 60)

html2 = open("output/discovery/job_detail_raw.html", "r").read()
print(f"Job HTML boyutu: {len(html2)/1024:.0f}KB\n")

# Description doğrudan HTML'de mi?
desc_match = re.findall(r'show-more-less-html__markup[^>]*>(.*?)</div', html2, re.DOTALL)
print(f"Description (show-more-less-html): {len(desc_match)}")
if desc_match:
    clean = re.sub(r'<[^>]+>', ' ', desc_match[0]).strip()
    clean = re.sub(r'\s+', ' ', clean)
    print(f"  Len: {len(clean)}")
    print(f"  Preview: {clean[:200]}...")
print()

# Job criteria (seniority, type)
criteria = re.findall(r'description__job-criteria-text[^>]*>(.*?)<', html2, re.DOTALL)
print(f"Job criteria: {len(criteria)}")
for c in criteria:
    print(f"  {c.strip()}")
print()

# decoratedJobPostingId
djp = re.findall(r'id="decoratedJobPostingId"[^>]*>(.*?)<', html2, re.DOTALL)
print(f"decoratedJobPostingId: {djp}")

# ═══════════════════════════════════════
# LIGHT HTML (sadece document, no JS)
# ═══════════════════════════════════════
print()
print("=" * 60)
print("LIGHT HTML (sadece document response)")
print("=" * 60)

html3 = open("output/discovery/job_detail_light.html", "r").read()
print(f"Light HTML boyutu: {len(html3)/1024:.0f}KB\n")

# Aynı verilere sadece document response'tan erişebiliyor muyuz?
desc_light = re.findall(r'show-more-less-html__markup[^>]*>(.*?)</div', html3, re.DOTALL)
print(f"Light - Description: {len(desc_light)}")
if desc_light:
    clean = re.sub(r'<[^>]+>', ' ', desc_light[0]).strip()
    clean = re.sub(r'\s+', ' ', clean)
    print(f"  Len: {len(clean)}")
    print(f"  Preview: {clean[:200]}...")
print()

criteria_light = re.findall(r'description__job-criteria-text[^>]*>(.*?)<', html3, re.DOTALL)
print(f"Light - Job criteria: {len(criteria_light)}")
for c in criteria_light:
    print(f"  {c.strip()}")
print()

titles_light = re.findall(r'top-card-layout__title[^>]*>(.*?)<', html3, re.DOTALL)
print(f"Light - Job title: {titles_light}")
print()

company_light = re.findall(r'topcard__org-name-link[^>]*>(.*?)<', html3, re.DOTALL)
print(f"Light - Company: {company_light}")
print()

print("=" * 60)
print("SONUC: HTML SSR mi? Veri document'te mi?")
print("=" * 60)
print(f"Search - titles in HTML: {len(titles) > 0}")
print(f"Job Detail - description in HTML: {len(desc_match) > 0}")
print(f"Light (no JS) - description in HTML: {len(desc_light) > 0}")
print(f"Light (no JS) - criteria in HTML: {len(criteria_light) > 0}")
print()
print("Eger hepsi True ise → JS calistirmaya gerek yok!")
print("Sadece HTTP GET + HTML parse yeterli!")
