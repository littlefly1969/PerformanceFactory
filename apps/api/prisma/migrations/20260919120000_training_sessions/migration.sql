ALTER TABLE "TrainingPlanItem" ADD COLUMN "orderIndex" INTEGER NOT NULL DEFAULT 0;
-- Recover the original generator order for existing releases when available.
WITH ordered AS (
  SELECT i."id", COALESCE(MIN(p.ordinality)::integer - 1, 0) AS position
  FROM "TrainingPlanItem" i JOIN "TrainingPlanRelease" r ON r."id" = i."trainingPlanReleaseId"
  LEFT JOIN LATERAL jsonb_array_elements(CASE WHEN jsonb_typeof(r."outputJson"->'planItems') = 'array' THEN r."outputJson"->'planItems' ELSE '[]'::jsonb END) WITH ORDINALITY p(value, ordinality)
    ON p.value->>'title' = i."title" AND p.value->>'body' = i."body"
  GROUP BY i."id"
) UPDATE "TrainingPlanItem" i SET "orderIndex" = o.position FROM ordered o WHERE o."id" = i."id";
CREATE TYPE "TrainingSessionStatus" AS ENUM ('SCHEDULED', 'COMPLETED', 'SKIPPED');
CREATE TABLE "TrainingSession" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "trainingPlanReleaseId" TEXT NOT NULL,
  "trainingPlanItemId" TEXT NOT NULL,
  "scheduledDate" DATE NOT NULL,
  "sequence" INTEGER NOT NULL,
  "status" "TrainingSessionStatus" NOT NULL DEFAULT 'SCHEDULED',
  "completedAt" TIMESTAMP(3),
  "skippedAt" TIMESTAMP(3),
  "completionNotes" TEXT,
  "completionRating" INTEGER,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "TrainingSession_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "TrainingSession_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "TrainingSession_trainingPlanReleaseId_fkey" FOREIGN KEY ("trainingPlanReleaseId") REFERENCES "TrainingPlanRelease"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "TrainingSession_trainingPlanItemId_fkey" FOREIGN KEY ("trainingPlanItemId") REFERENCES "TrainingPlanItem"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "TrainingSession_trainingPlanReleaseId_trainingPlanItemId_key" ON "TrainingSession"("trainingPlanReleaseId", "trainingPlanItemId");
CREATE INDEX "TrainingSession_userId_scheduledDate_idx" ON "TrainingSession"("userId", "scheduledDate");
CREATE INDEX "TrainingSession_trainingPlanReleaseId_scheduledDate_idx" ON "TrainingSession"("trainingPlanReleaseId", "scheduledDate");
-- Backfill actual published content only, never weeks of synthetic workouts.
WITH source AS (
 SELECT i.*, r."userId", (COALESCE(r."publishedAt", r."createdAt") AT TIME ZONE 'UTC' AT TIME ZONE 'Europe/Rome')::date AS start_date,
 row_number() OVER (PARTITION BY r."id" ORDER BY i."orderIndex", i."id") AS seq,
 count(*) OVER (PARTITION BY r."id") AS total
 FROM "TrainingPlanItem" i JOIN "TrainingPlanRelease" r ON r."id" = i."trainingPlanReleaseId"
 WHERE r."status" = 'ACTIVE' OR r."publishedAt" IS NOT NULL
)
INSERT INTO "TrainingSession" ("id", "userId", "trainingPlanReleaseId", "trainingPlanItemId", "scheduledDate", "sequence", "status", "completedAt", "completionNotes", "completionRating", "updatedAt")
SELECT gen_random_uuid()::text, "userId", "trainingPlanReleaseId", "id", start_date + floor((seq - 1) * 7.0 / total)::integer, seq,
 CASE WHEN "status" = 'COMPLETED' THEN 'COMPLETED' WHEN "status" = 'SKIPPED' THEN 'SKIPPED' ELSE 'SCHEDULED' END::"TrainingSessionStatus",
 "completedAt", "completionNotes", "completionRating", CURRENT_TIMESTAMP FROM source;
