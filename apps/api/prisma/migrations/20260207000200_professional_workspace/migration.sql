-- Professional approval workspace hardening.

ALTER TABLE "PlanItem"
  ADD COLUMN IF NOT EXISTS "rejectedAt" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "rejectionReason" TEXT;

ALTER TABLE "QuestionSetAreaApproval"
  ADD COLUMN IF NOT EXISTS "approvedByProfessionalId" TEXT,
  ADD COLUMN IF NOT EXISTS "approvedAt" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "rejectedAt" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "rejectionReason" TEXT;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'QuestionSetAreaApproval_approvedByProfessionalId_fkey') THEN
    ALTER TABLE "QuestionSetAreaApproval"
      ADD CONSTRAINT "QuestionSetAreaApproval_approvedByProfessionalId_fkey"
      FOREIGN KEY ("approvedByProfessionalId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;
