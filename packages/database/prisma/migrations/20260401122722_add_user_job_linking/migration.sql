-- AlterTable
ALTER TABLE "scraper_audits" ADD COLUMN     "userId" TEXT;

-- CreateTable
CREATE TABLE "user_job_listings" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "jobId" TEXT NOT NULL,
    "auditId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "user_job_listings_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "user_job_listings_userId_createdAt_idx" ON "user_job_listings"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "user_job_listings_auditId_idx" ON "user_job_listings"("auditId");

-- CreateIndex
CREATE UNIQUE INDEX "user_job_listings_userId_jobId_key" ON "user_job_listings"("userId", "jobId");

-- CreateIndex
CREATE INDEX "scraper_audits_userId_startedAt_idx" ON "scraper_audits"("userId", "startedAt");

-- AddForeignKey
ALTER TABLE "scraper_audits" ADD CONSTRAINT "scraper_audits_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_job_listings" ADD CONSTRAINT "user_job_listings_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_job_listings" ADD CONSTRAINT "user_job_listings_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "job_listings"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_job_listings" ADD CONSTRAINT "user_job_listings_auditId_fkey" FOREIGN KEY ("auditId") REFERENCES "scraper_audits"("id") ON DELETE SET NULL ON UPDATE CASCADE;
