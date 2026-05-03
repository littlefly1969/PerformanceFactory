ALTER TABLE "UserPerformanceGoal"
  ADD COLUMN "normalizedGoal" JSONB,
  ADD COLUMN "goalEvaluation" JSONB,
  ADD COLUMN "suggestedReformulatedGoal" TEXT,
  ADD COLUMN "questionsToUser" JSONB,
  ADD COLUMN "nextStep" TEXT;
