ALTER TABLE "SportSpecializationAreaPrompt" ADD COLUMN "isScheduled" BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE "ImprovementPlanRelease"
  ADD COLUMN "startsOn" DATE,
  ADD COLUMN "endsOn" DATE,
  ADD COLUMN "windowDays" INTEGER,
  ADD COLUMN "trainingReleaseId" TEXT;

ALTER TABLE "ImprovementPlanRelease"
  ADD CONSTRAINT "ImprovementPlanRelease_trainingReleaseId_fkey"
  FOREIGN KEY ("trainingReleaseId") REFERENCES "TrainingPlanRelease"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Una sola release per area e finestra sportiva; le release storiche restano NULL e non collidono.
CREATE UNIQUE INDEX "ImprovementPlanRelease_userId_areaId_trainingReleaseId_key"
  ON "ImprovementPlanRelease"("userId", "areaId", "trainingReleaseId");

ALTER TABLE "AbilityPlanOperation" ADD COLUMN "trainingReleaseId" TEXT;

CREATE TABLE "AreaSession" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "userId" TEXT NOT NULL,
  "planReleaseId" TEXT NOT NULL,
  "planItemId" TEXT NOT NULL,
  "areaId" TEXT NOT NULL,
  "scheduledDate" DATE NOT NULL,
  "sequence" INTEGER NOT NULL,
  "status" "TrainingSessionStatus" NOT NULL DEFAULT 'SCHEDULED',
  "completedAt" TIMESTAMP(3),
  "skippedAt" TIMESTAMP(3),
  "completionNotes" TEXT,
  "completionRating" INTEGER,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "AreaSession_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "AreaSession_planReleaseId_fkey" FOREIGN KEY ("planReleaseId") REFERENCES "ImprovementPlanRelease"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "AreaSession_planItemId_fkey" FOREIGN KEY ("planItemId") REFERENCES "PlanItem"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "AreaSession_areaId_fkey" FOREIGN KEY ("areaId") REFERENCES "Area"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "AreaSession_planReleaseId_planItemId_key" ON "AreaSession"("planReleaseId", "planItemId");
CREATE INDEX "AreaSession_userId_scheduledDate_idx" ON "AreaSession"("userId", "scheduledDate");
CREATE INDEX "AreaSession_planReleaseId_scheduledDate_idx" ON "AreaSession"("planReleaseId", "scheduledDate");
