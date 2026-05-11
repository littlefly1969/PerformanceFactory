CREATE TABLE "TrainingPlanRelease" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "version" INTEGER NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'ACTIVE',
  "generatedBy" TEXT NOT NULL DEFAULT 'AI',
  "summaryText" TEXT NOT NULL,
  "outputJson" JSONB NOT NULL,
  "provider" TEXT NOT NULL,
  "model" TEXT NOT NULL,
  "promptVersion" TEXT NOT NULL,
  "promptHash" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "publishedAt" TIMESTAMP(3),
  "archivedAt" TIMESTAMP(3),
  "sourceSnapshotId" TEXT,
  "proposedByAdminId" TEXT,

  CONSTRAINT "TrainingPlanRelease_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "TrainingPlanRelease_userId_version_key"
  ON "TrainingPlanRelease"("userId", "version");

CREATE INDEX "TrainingPlanRelease_userId_status_createdAt_idx"
  ON "TrainingPlanRelease"("userId", "status", "createdAt");

ALTER TABLE "TrainingPlanRelease"
  ADD CONSTRAINT "TrainingPlanRelease_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "TrainingPlanRelease"
  ADD CONSTRAINT "TrainingPlanRelease_sourceSnapshotId_fkey"
  FOREIGN KEY ("sourceSnapshotId") REFERENCES "PerformanceProfileSnapshot"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "TrainingPlanRelease"
  ADD CONSTRAINT "TrainingPlanRelease_proposedByAdminId_fkey"
  FOREIGN KEY ("proposedByAdminId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
