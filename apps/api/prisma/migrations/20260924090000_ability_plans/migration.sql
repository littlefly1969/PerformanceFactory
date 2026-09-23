ALTER TABLE "ImprovementPlanRelease" ADD COLUMN "approvalSource" TEXT, ADD COLUMN "approvedAt" TIMESTAMP(3);
CREATE TABLE "AbilityPlanOperation" (
 "id" TEXT NOT NULL PRIMARY KEY, "userId" TEXT NOT NULL, "areaId" TEXT NOT NULL,
 "generationKey" TEXT NOT NULL, "releaseId" TEXT, "approvalMode" TEXT NOT NULL DEFAULT 'AUTO',
 "requestedById" TEXT, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 "completedAt" TIMESTAMP(3), "leaseToken" TEXT, "leaseUntil" TIMESTAMP(3),
 "attempts" INTEGER NOT NULL DEFAULT 0, "nextAttemptAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "lastErrorCode" TEXT,
 CONSTRAINT "AbilityPlanOperation_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE,
 CONSTRAINT "AbilityPlanOperation_areaId_fkey" FOREIGN KEY ("areaId") REFERENCES "Area"("id") ON DELETE CASCADE ON UPDATE CASCADE,
 CONSTRAINT "AbilityPlanOperation_releaseId_fkey" FOREIGN KEY ("releaseId") REFERENCES "ImprovementPlanRelease"("id") ON DELETE SET NULL ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "AbilityPlanOperation_generationKey_key" ON "AbilityPlanOperation"("generationKey");
CREATE UNIQUE INDEX "AbilityPlanOperation_releaseId_key" ON "AbilityPlanOperation"("releaseId");
CREATE INDEX "AbilityPlanOperation_completedAt_nextAttemptAt_leaseUntil_idx" ON "AbilityPlanOperation"("completedAt", "nextAttemptAt", "leaseUntil");
CREATE INDEX "AbilityPlanOperation_userId_areaId_idx" ON "AbilityPlanOperation"("userId", "areaId");
