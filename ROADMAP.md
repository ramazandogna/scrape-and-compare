# 🚀 PROJECT: AI-Driven Talent Acquisition & Job Matching Engine
**Context:** You are a Senior Full-Stack Engineer and Automation Expert. We are building a high-performance system that automates job searching by scraping platforms like LinkedIn and scoring opportunities using LLMs.

---

## 🏗️ 1. ARCHITECTURAL BLUEPRINT (The Stack)
- **Runtime:** Node.js (v20+) with TypeScript.
- **Backend:** NestJS (Modular Architecture).
- **Frontend:** Next.js 15 (App Router) + Tailwind CSS + Shadcn/UI.
- **Scraping Engine:** Playwright with `stealth-plugin` & `fingerprint-generator`.
- **Database:** PostgreSQL (Prisma ORM) for job persistence & User matching logs.
- **Intelligence Layer:** OpenAI GPT-4o mini (for parsing JDs and semantic scoring).

---

## 🛠️ 2. CORE MODULES & AI PROMPT DIRECTIVES

### Module A: The Ghost Scraper (Data Ingestion)
**Objective:** Bypass Cloudflare, TLS Fingerprinting, and Bot Detection on job boards.
- **Requirement:** Implementation of `playwright-extra-plugin-stealth`.
- **Logic:** Must handle multi-keyword searches (e.g., "Frontend", "React", "Fullstack") concurrently using Worker Threads or async queues.
- **Success Metric:** Successfully extracting Job Title, Company, Description, and Link without triggering 403 Forbidden or Captcha.

### Module B: The CV Parser & Skills Extractor
**Objective:** Convert raw CV/User Input into a structured JSON profile.
- **Logic:** Use LLM to extract { "skills": [], "experience_years": number, "tech_stack": [] } from user input.
- **Constraint:** Must support automated CV upload (PDF parsing) in future iterations.

### Module C: Semantic Matcher (The Brain)
**Objective:** Compare extracted Job Descriptions (JD) with User Profile.
- **Logic:** Scoring formula: 
  - (Matched Skills / Required Skills) * 0.6 + (Years Experience Fit) * 0.4.
- **Constraint:** Only return jobs with a confidence score > 50%.
- **Output:** A curated list of "Perfect Matches" with a summary of *why* they match.

---

## 🗺️ 3. EXECUTION ROADMAP (Phase-by-Phase)

### Phase 1: Infiltration (Scraping & Bypass)
- [ ] Initialize NestJS project with Playwright.
- [ ] Implement TLS Fingerprint rotation using `curl_cffi` or Playwright Stealth.
- [ ] Create a scraper that takes a "Keyword" and "Location" and returns 50 job listings.

### Phase 2: Intelligence (LLM Scoring)
- [ ] Build a service to feed Job Descriptions to GPT-4o.
- [ ] Implement the semantic scoring logic to filter out noise.
- [ ] Map 5 different search queries into a single unified result set.

### Phase 3: Interface (Next.js Dashboard)
- [ ] Build a clean UI where the user inputs their role and skills.
- [ ] Display results in a card-based layout with "Match Percentage" badges.
- [ ] Add "Apply" button redirecting to the original listing.

---

## 🤖 4. INITIAL AGENT INSTRUCTIONS (Launch Prompt)

"Act as a Lead Software Architect. Based on the roadmap above, your first task is to write a **Robust Scraping Service** in TypeScript. 

1. Use **Playwright** with **Stealth Plugin**.
2. Create a function `fetchJobs(keywords: string[], location: string)` that rotates through the keywords.
3. Ensure the browser profile mimics a human (random delays, mouse movements, realistic headers).
4. The output must be a cleaned JSON array of job postings.
5. Explain how you will handle LinkedIn's dynamic class names and anti-bot challenges."