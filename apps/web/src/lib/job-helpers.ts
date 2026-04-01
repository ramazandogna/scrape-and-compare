// ═══════════════════════════════════════════
// DASHBOARD HELPERS — Pure utility functions
// ═══════════════════════════════════════════
// Her biri tek sorumluluk, sıfır side-effect.
// Bileşenler bunları doğrudan import eder.

import type {
  EnrichedJob,
  FilterState,
  SortState,
  JobDto,
  MatchResultDto,
} from "@/types/job";

// ═══════════════════════════════════════════
// 1. COMPANY AVATAR — Deterministik renk üretimi
// ═══════════════════════════════════════════

/**
 * Şirket adından deterministik HSL renk üretir.
 * Aynı şirket her zaman aynı rengi alır.
 * djb2 hash → hue (0-360) → pastel HSL
 */
const AVATAR_COLORS = [
  "bg-red-100 text-red-700",
  "bg-blue-100 text-blue-700",
  "bg-green-100 text-green-700",
  "bg-purple-100 text-purple-700",
  "bg-amber-100 text-amber-700",
  "bg-cyan-100 text-cyan-700",
  "bg-pink-100 text-pink-700",
  "bg-indigo-100 text-indigo-700",
  "bg-teal-100 text-teal-700",
  "bg-orange-100 text-orange-700",
] as const;

export function getAvatarColor(name: string): string {
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = name.charCodeAt(i) + ((hash << 5) - hash);
  }
  const index = Math.abs(hash) % AVATAR_COLORS.length;
  return AVATAR_COLORS[index]!;
}

/** Şirket adının baş harfini döndürür */
export function getInitial(name: string): string {
  return name.charAt(0).toUpperCase();
}

// ═══════════════════════════════════════════
// 2. SALARY FORMATTING
// ═══════════════════════════════════════════

/**
 * Maaş aralığını insan dostu formata çevirir.
 * formatSalary(150000, 200000, "TRY") → "150k - 200k TRY"
 * formatSalary(null, null, null)       → null
 */
export function formatSalary(
  min: number | null,
  max: number | null,
  currency: string | null
): string | null {
  if (!min && !max) return null;
  const fmt = (n: number) => (n >= 1000 ? `${Math.round(n / 1000)}k` : `${n}`);
  const cur = currency ?? "TRY";
  if (min && max) return `${fmt(min)} - ${fmt(max)} ${cur}`;
  if (min) return `${fmt(min)}+ ${cur}`;
  if (max) return `≤${fmt(max)} ${cur}`;
  return null;
}

// ═══════════════════════════════════════════
// 3. TIME AGO — Relative timestamp
// ═══════════════════════════════════════════

/**
 * ISO date string'i relatif zamana çevirir.
 * "2026-03-31T10:00:00Z" → "1 gün önce"
 * Fallback: postedDate string'i doğrudan döner (LinkedIn "2 days ago" veriyor)
 */
export function timeAgo(dateString: string | null, fallback?: string | null): string {
  if (!dateString && fallback) return fallback;
  if (!dateString) return "";

  const date = new Date(dateString);
  if (isNaN(date.getTime())) return dateString; // parse edilemezse ham string

  const now = Date.now();
  const diffMs = now - date.getTime();
  const diffMin = Math.floor(diffMs / 60_000);
  const diffHr = Math.floor(diffMs / 3_600_000);
  const diffDay = Math.floor(diffMs / 86_400_000);

  if (diffMin < 1) return "az önce";
  if (diffMin < 60) return `${diffMin} dk önce`;
  if (diffHr < 24) return `${diffHr} saat önce`;
  if (diffDay < 30) return `${diffDay} gün önce`;
  return `${Math.floor(diffDay / 30)} ay önce`;
}

// ═══════════════════════════════════════════
// 4. FRONTEND JOIN — Jobs + Match Results merge
// ═══════════════════════════════════════════

/**
 * İki API response'unu birleştirir:
 * - jobs: GET /api/jobs
 * - matches: GET /api/matcher/results/:userId
 *
 * Map<jobId, MatchResult> ile O(n) lookup.
 * Match yoksa → match: null (puanlanmamış)
 */
export function enrichJobsWithMatches(
  jobs: JobDto[],
  matches: MatchResultDto[]
): EnrichedJob[] {
  const matchMap = new Map<string, MatchResultDto>();
  for (const m of matches) {
    matchMap.set(m.job.id, m);
  }

  return jobs.map((job) => {
    const m = matchMap.get(job.id);
    return {
      ...job,
      match: m
        ? {
            score: m.score,
            explanation: m.explanation,
            matchedSkills: m.matchedSkills,
            missingSkills: m.missingSkills,
          }
        : null,
    };
  });
}

// ═══════════════════════════════════════════
// 5. CLIENT-SIDE FILTER
// ═══════════════════════════════════════════

/**
 * EnrichedJob[] üzerinde aktif filtreleri uygular.
 * Her filtre null ise o filtre atlanır (pass-through).
 * Chain: source → seniority → employment → salary → score
 */
export function applyFilters(
  jobs: EnrichedJob[],
  filters: FilterState
): EnrichedJob[] {
  return jobs.filter((job) => {
    if (filters.source && job.source !== filters.source) return false;
    if (
      filters.seniorityLevel &&
      job.seniorityLevel !== filters.seniorityLevel
    )
      return false;
    if (
      filters.employmentType &&
      job.employmentType !== filters.employmentType
    )
      return false;
    if (filters.minSalary && (job.salaryMin ?? 0) < filters.minSalary)
      return false;
    if (filters.minScore && (job.match?.score ?? 0) < filters.minScore)
      return false;
    return true;
  });
}

// ═══════════════════════════════════════════
// 6. CLIENT-SIDE SORT
// ═══════════════════════════════════════════

/**
 * Tri-state sıralama: default → asc → desc → default
 * null/undefined değerler daima sona gider.
 */
export function applySort(
  jobs: EnrichedJob[],
  sort: SortState
): EnrichedJob[] {
  if (sort.field === "default") return jobs;

  const multiplier = sort.direction === "asc" ? 1 : -1;

  return [...jobs].sort((a, b) => {
    const valA = getSortValue(a, sort.field);
    const valB = getSortValue(b, sort.field);

    // null'lar daima sona
    if (valA === null && valB === null) return 0;
    if (valA === null) return 1;
    if (valB === null) return -1;

    return (valA - valB) * multiplier;
  });
}

function getSortValue(job: EnrichedJob, field: SortState["field"]): number | null {
  switch (field) {
    case "date":
      return new Date(job.scrapedAt).getTime() || null;
    case "salary":
      return job.salaryMin;
    case "score":
      return job.match?.score ?? null;
    default:
      return null;
  }
}

// ═══════════════════════════════════════════
// 7. CLIENT-SIDE PAGINATION
// ═══════════════════════════════════════════

export interface PaginationResult<T> {
  items: T[];
  page: number;
  totalPages: number;
  total: number;
}

export function paginate<T>(
  items: T[],
  page: number,
  pageSize: number
): PaginationResult<T> {
  const total = items.length;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const safePage = Math.min(Math.max(1, page), totalPages);
  const start = (safePage - 1) * pageSize;

  return {
    items: items.slice(start, start + pageSize),
    page: safePage,
    totalPages,
    total,
  };
}
