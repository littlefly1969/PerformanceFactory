-- AlterTable
ALTER TABLE "TrainingPlanRelease" ADD COLUMN     "approvalMode" TEXT NOT NULL DEFAULT 'MANUAL',
ADD COLUMN     "approvalSource" TEXT,
ADD COLUMN     "approvedAt" TIMESTAMP(3),
ADD COLUMN     "lifecycleManaged" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "previousReleaseId" TEXT,
ADD COLUMN     "sessionApprovalMode" TEXT NOT NULL DEFAULT 'INHERIT_PLAN';

-- AlterTable
ALTER TABLE "TrainingPlanItem" ADD COLUMN     "approvalSource" TEXT;

-- AlterTable
ALTER TABLE "TrainingQuestionSetCoachApproval" ADD COLUMN     "approvalSource" TEXT;

-- AlterTable
ALTER TABLE "CycleAuditLog" ADD COLUMN     "coachId" TEXT,
ADD COLUMN     "metadata" JSONB,
ADD COLUMN     "operationId" TEXT,
ADD COLUMN     "source" TEXT NOT NULL DEFAULT 'USER',
ADD COLUMN     "trainingPlanReleaseId" TEXT;

-- CreateTable
CREATE TABLE "TrainingLifecycleOperation" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "generationKey" TEXT NOT NULL,
    "previousReleaseId" TEXT,
    "releaseId" TEXT,
    "approvalMode" TEXT NOT NULL DEFAULT 'AUTO',
    "requestedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMP(3),
    "leaseToken" TEXT,
    "leaseUntil" TIMESTAMP(3),
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "nextAttemptAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastErrorCode" TEXT,

    CONSTRAINT "TrainingLifecycleOperation_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "TrainingLifecycleOperation_generationKey_key" ON "TrainingLifecycleOperation"("generationKey");

-- CreateIndex
CREATE UNIQUE INDEX "TrainingLifecycleOperation_previousReleaseId_key" ON "TrainingLifecycleOperation"("previousReleaseId");

-- CreateIndex
CREATE UNIQUE INDEX "TrainingLifecycleOperation_releaseId_key" ON "TrainingLifecycleOperation"("releaseId");

-- CreateIndex
CREATE INDEX "TrainingLifecycleOperation_completedAt_nextAttemptAt_leaseU_idx" ON "TrainingLifecycleOperation"("completedAt", "nextAttemptAt", "leaseUntil");

-- CreateIndex
CREATE UNIQUE INDEX "TrainingPlanRelease_previousReleaseId_key" ON "TrainingPlanRelease"("previousReleaseId");

-- AddForeignKey
ALTER TABLE "TrainingLifecycleOperation" ADD CONSTRAINT "TrainingLifecycleOperation_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TrainingLifecycleOperation" ADD CONSTRAINT "TrainingLifecycleOperation_releaseId_fkey" FOREIGN KEY ("releaseId") REFERENCES "TrainingPlanRelease"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TrainingLifecycleOperation" ADD CONSTRAINT "TrainingLifecycleOperation_previousReleaseId_fkey" FOREIGN KEY ("previousReleaseId") REFERENCES "TrainingPlanRelease"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TrainingPlanRelease" ADD CONSTRAINT "TrainingPlanRelease_previousReleaseId_fkey" FOREIGN KEY ("previousReleaseId") REFERENCES "TrainingPlanRelease"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CycleAuditLog" ADD CONSTRAINT "CycleAuditLog_trainingPlanReleaseId_fkey" FOREIGN KEY ("trainingPlanReleaseId") REFERENCES "TrainingPlanRelease"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CycleAuditLog" ADD CONSTRAINT "CycleAuditLog_operationId_fkey" FOREIGN KEY ("operationId") REFERENCES "TrainingLifecycleOperation"("id") ON DELETE SET NULL ON UPDATE CASCADE;


-- Uniqueness for cycles owned by the lifecycle; legacy drafts are adopted under a per-athlete lock.
CREATE UNIQUE INDEX "TrainingPlanRelease_one_open_lifecycle" ON "TrainingPlanRelease" ("userId") WHERE "lifecycleManaged" = true AND "cycleStatus" <> 'CLOSED';
-- Existing published training joins completion monitoring without changing its approval history.
UPDATE "TrainingPlanRelease" p SET "lifecycleManaged" = true
WHERE p.status = 'ACTIVE' AND p."cycleStatus" = 'PUBLISHED'
AND NOT EXISTS (SELECT 1 FROM "TrainingPlanRelease" newer WHERE newer."userId" = p."userId" AND newer.status = 'ACTIVE' AND newer.version > p.version);
