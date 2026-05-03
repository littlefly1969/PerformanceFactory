ALTER TABLE "UserPerformanceGoal"
  ADD COLUMN "interpretedGoal" TEXT,
  ADD COLUMN "validationStatus" TEXT NOT NULL DEFAULT 'PENDING',
  ADD COLUMN "validationMessage" TEXT,
  ADD COLUMN "rejectionReason" TEXT,
  ADD COLUMN "frozenAt" TIMESTAMP(3);
