// ═══════════════════════════════════════════
// JOB & MATCH TYPES — Frontend Data Models
// ═══════════════════════════════════════════
// Backend API response'larının type-safe karşılıkları.
// Bu dosya tüm dashboard bileşenlerinin ortak dili.

/** AI tarafından çıkarılan skill bilgisi */
export interface ExtractedSkill {
  name: string;
  category: string;
  isMain: boolean;
}

/** GET /api/jobs response'undaki tek ilan */
export interface JobDto {
  id: string;
  externalId: string;
  url: string;
  title: string;
  company: string;
  location: string;
  salary: string | null;
  salaryMin: number | null;
  salaryMax: number | null;
  salaryCurrency: string | null;
  seniorityLevel: string | null;
  employmentType: string | null;
  workType: string | null;
  skills: ExtractedSkill[];
  postedDate: string | null;
  source: string;
  scrapedAt: string;
}

/** Paginated API response wrapper */
export interface PaginatedResponse<T> {
  data: T[];
  meta: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
    hasNext: boolean;
    hasPrev: boolean;
  };
}

/** GET /api/matcher/results/:userId response'undaki tek match */
export interface MatchResultDto {
  id: string;
  score: number;
  explanation: string;
  matchedSkills: string[];
  missingSkills: string[];
  createdAt: string;
  job: {
    id: string;
    title: string;
    company: string;
    location: string;
    url: string;
    seniorityLevel: string | null;
    employmentType: string | null;
  };
}

/**
 * Frontend JOIN sonucu: Job + opsiyonel match bilgisi.
 * Dashboard'daki her kart bu tipi kullanır.
 */
export interface EnrichedJob extends JobDto {
  match: {
    score: number;
    explanation: string;
    matchedSkills: string[];
    missingSkills: string[];
  } | null;
}

// ═══════════════════════════════════════════
// FILTER & SORT STATE
// ═══════════════════════════════════════════

export interface FilterState {
  source: string | null;
  seniorityLevel: string | null;
  employmentType: string | null;
  workType: string | null;
  minSalary: number | null;
  scoreStatus: "all" | "matched" | "unmatched" | "unscored";
}

export type SortField = "default" | "date" | "salary" | "score";
export type SortDirection = "asc" | "desc";

export interface SortState {
  field: SortField;
  direction: SortDirection;
}

export const INITIAL_FILTERS: FilterState = {
  source: null,
  seniorityLevel: null,
  employmentType: null,
  workType: null,
  minSalary: null,
  scoreStatus: "all",
};

export const INITIAL_SORT: SortState = {
  field: "default",
  direction: "desc",
};

// ═══════════════════════════════════════════
// FILTER OPTIONS (UI'da gösterilecek seçenekler)
// ═══════════════════════════════════════════

export const SENIORITY_OPTIONS = [
  { label: "Hepsi", value: null },
  { label: "Junior", value: "Junior" },
  { label: "Mid", value: "Mid-Senior level" },
  { label: "Senior", value: "Senior" },
  { label: "Lead", value: "Lead" },
] as const;

export const EMPLOYMENT_OPTIONS = [
  { label: "Hepsi", value: null },
  { label: "Full-time", value: "Full-time" },
  { label: "Part-time", value: "Part-time" },
  { label: "Contract", value: "Contract" },
] as const;

export const WORK_TYPE_OPTIONS = [
  { label: "Hepsi", value: null },
  { label: "Remote", value: "Remote" },
  { label: "Hybrid", value: "Hybrid" },
  { label: "On-site", value: "On-site" },
] as const;

export const SALARY_OPTIONS = [
  { label: "Hepsi", value: null },
  { label: "> 30k", value: 30000 },
  { label: "> 50k", value: 50000 },
  { label: "> 80k", value: 80000 },
  { label: "> 100k", value: 100000 },
] as const;

export const SCORE_OPTIONS = [
  { label: "Hepsi", value: "all" },
  { label: "Eşleşti (>=50)", value: "matched" },
  { label: "Eşleşmedi (0-49)", value: "unmatched" },
  { label: "Puanlanamadı", value: "unscored" },
] as const;
