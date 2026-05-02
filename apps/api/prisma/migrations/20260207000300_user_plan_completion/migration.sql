-- User plan item completion fields.

ALTER TABLE "PlanItem"
  ADD COLUMN IF NOT EXISTS "completedAt" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "completionNotes" TEXT,
  ADD COLUMN IF NOT EXISTS "completionRating" INTEGER;
