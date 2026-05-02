-- Area-independent cycles realignment.

ALTER TABLE "ImprovementPlanRelease" ADD COLUMN IF NOT EXISTS "areaId" TEXT;
ALTER TABLE "QuestionSet" ADD COLUMN IF NOT EXISTS "areaId" TEXT;

-- Backfill QuestionSet.areaId from existing questions.
UPDATE "QuestionSet" qs
SET "areaId" = q."areaId"
FROM (
  SELECT "questionSetId", MIN("areaId") AS "areaId"
  FROM "Question"
  GROUP BY "questionSetId"
) q
WHERE qs.id = q."questionSetId" AND qs."areaId" IS NULL;

-- Backfill ImprovementPlanRelease.areaId from plan items.
UPDATE "ImprovementPlanRelease" pr
SET "areaId" = pi."areaId"
FROM (
  SELECT "planReleaseId", MIN("areaId") AS "areaId"
  FROM "PlanItem"
  GROUP BY "planReleaseId"
) pi
WHERE pr.id = pi."planReleaseId" AND pr."areaId" IS NULL;

-- Fallback: backfill from question sets if still missing.
UPDATE "ImprovementPlanRelease" pr
SET "areaId" = qs."areaId"
FROM "QuestionSet" qs
WHERE qs."planReleaseId" = pr.id AND pr."areaId" IS NULL;

-- Enforce per-area consistency for legacy data (destructive cleanup).
-- Remove answers/options/questions that don't match the assigned QuestionSet area.
DELETE FROM "UserAnswer" ua
USING "Question" q, "QuestionSet" qs
WHERE ua."questionId" = q.id
  AND q."questionSetId" = qs.id
  AND q."areaId" <> qs."areaId";

DELETE FROM "AnswerOption" ao
USING "Question" q, "QuestionSet" qs
WHERE ao."questionId" = q.id
  AND q."questionSetId" = qs.id
  AND q."areaId" <> qs."areaId";

DELETE FROM "Question" q
USING "QuestionSet" qs
WHERE q."questionSetId" = qs.id
  AND q."areaId" <> qs."areaId";

-- Remove approvals that don't match the assigned QuestionSet area.
DELETE FROM "QuestionSetAreaApproval" qsa
USING "QuestionSet" qs
WHERE qsa."questionSetId" = qs.id
  AND qsa."areaId" <> qs."areaId";

-- Remove plan items that don't match the assigned plan release area.
DELETE FROM "PlanItem" pi
USING "ImprovementPlanRelease" pr
WHERE pi."planReleaseId" = pr.id
  AND pi."areaId" <> pr."areaId";

DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM "ImprovementPlanRelease" WHERE "areaId" IS NULL) THEN
    RAISE EXCEPTION 'ImprovementPlanRelease.areaId contains NULL. Backfill failed.';
  END IF;
  IF EXISTS (SELECT 1 FROM "QuestionSet" WHERE "areaId" IS NULL) THEN
    RAISE EXCEPTION 'QuestionSet.areaId contains NULL. Backfill failed.';
  END IF;
END $$;

ALTER TABLE "ImprovementPlanRelease"
  ALTER COLUMN "areaId" SET NOT NULL;

ALTER TABLE "QuestionSet"
  ALTER COLUMN "areaId" SET NOT NULL;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ImprovementPlanRelease_areaId_fkey') THEN
    ALTER TABLE "ImprovementPlanRelease"
      ADD CONSTRAINT "ImprovementPlanRelease_areaId_fkey"
      FOREIGN KEY ("areaId") REFERENCES "Area"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'QuestionSet_areaId_fkey') THEN
    ALTER TABLE "QuestionSet"
      ADD CONSTRAINT "QuestionSet_areaId_fkey"
      FOREIGN KEY ("areaId") REFERENCES "Area"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
END $$;

DROP INDEX IF EXISTS "ImprovementPlanRelease_userId_version_key";
CREATE UNIQUE INDEX IF NOT EXISTS "ImprovementPlanRelease_userId_areaId_version_key"
  ON "ImprovementPlanRelease"("userId", "areaId", "version");

DROP INDEX IF EXISTS "ImprovementPlanRelease_userId_active_key";
CREATE UNIQUE INDEX IF NOT EXISTS "ImprovementPlanRelease_userId_areaId_active_key"
  ON "ImprovementPlanRelease"("userId", "areaId")
  WHERE "status" = 'ACTIVE';

DROP INDEX IF EXISTS "ImprovementPlanRelease_userId_status_createdAt_idx";
CREATE INDEX IF NOT EXISTS "ImprovementPlanRelease_userId_areaId_status_createdAt_idx"
  ON "ImprovementPlanRelease"("userId", "areaId", "status", "createdAt");

DROP INDEX IF EXISTS "QuestionSet_userId_status_createdAt_idx";
CREATE INDEX IF NOT EXISTS "QuestionSet_userId_areaId_status_createdAt_idx"
  ON "QuestionSet"("userId", "areaId", "status", "createdAt");
