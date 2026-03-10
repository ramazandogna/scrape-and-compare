-- CreateEnum
CREATE TYPE "SalaryCurrency" AS ENUM ('TRY', 'USD', 'EUR');

-- CreateEnum
CREATE TYPE "SalaryPeriod" AS ENUM ('MONTHLY', 'YEARLY');

-- CreateEnum
CREATE TYPE "JobSource" AS ENUM ('LINKEDIN', 'INDEED', 'GLASSDOOR');

-- CreateEnum
CREATE TYPE "ScraperStatus" AS ENUM ('IDLE', 'SCANNING', 'EXTRACTING', 'COMPLETED', 'FAILED');

-- CreateTable
CREATE TABLE "users" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "techStack" TEXT[],
    "experienceYears" INTEGER NOT NULL DEFAULT 0,
    "preferredRoles" TEXT[],
    "preferredLocations" TEXT[],
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "job_listings" (
    "id" TEXT NOT NULL,
    "externalId" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "company" TEXT NOT NULL,
    "location" TEXT NOT NULL,
    "salary" TEXT,
    "salaryMin" INTEGER,
    "salaryMax" INTEGER,
    "salaryCurrency" "SalaryCurrency",
    "salaryPeriod" "SalaryPeriod",
    "description" TEXT,
    "requirements" TEXT[],
    "skills" JSONB NOT NULL DEFAULT '[]',
    "seniorityLevel" TEXT,
    "employmentType" TEXT,
    "postedDate" TEXT,
    "source" "JobSource" NOT NULL DEFAULT 'LINKEDIN',
    "scrapedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "job_listings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "match_results" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "jobId" TEXT NOT NULL,
    "score" DOUBLE PRECISION NOT NULL,
    "explanation" TEXT NOT NULL,
    "matchedSkills" TEXT[],
    "missingSkills" TEXT[],
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "match_results_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "scraper_audits" (
    "id" TEXT NOT NULL,
    "status" "ScraperStatus" NOT NULL DEFAULT 'IDLE',
    "keyword" TEXT NOT NULL,
    "location" TEXT NOT NULL,
    "totalFound" INTEGER NOT NULL DEFAULT 0,
    "totalExtracted" INTEGER NOT NULL DEFAULT 0,
    "errorCount" INTEGER NOT NULL DEFAULT 0,
    "errorDetails" JSONB,
    "durationMs" INTEGER NOT NULL DEFAULT 0,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMP(3),

    CONSTRAINT "scraper_audits_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE UNIQUE INDEX "job_listings_externalId_key" ON "job_listings"("externalId");

-- CreateIndex
CREATE UNIQUE INDEX "job_listings_url_key" ON "job_listings"("url");

-- CreateIndex
CREATE UNIQUE INDEX "match_results_userId_jobId_key" ON "match_results"("userId", "jobId");

-- AddForeignKey
ALTER TABLE "match_results" ADD CONSTRAINT "match_results_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "match_results" ADD CONSTRAINT "match_results_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "job_listings"("id") ON DELETE CASCADE ON UPDATE CASCADE;
