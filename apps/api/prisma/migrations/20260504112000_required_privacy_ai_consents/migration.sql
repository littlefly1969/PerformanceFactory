ALTER TABLE "Consent"
  ADD COLUMN "version" TEXT NOT NULL DEFAULT 'v1',
  ADD COLUMN "documentTitle" TEXT,
  ADD COLUMN "documentHash" TEXT,
  ADD COLUMN "ipAddress" TEXT,
  ADD COLUMN "userAgent" TEXT,
  ADD COLUMN "withdrawnAt" TIMESTAMP(3);

CREATE INDEX "Consent_userId_type_withdrawnAt_idx" ON "Consent"("userId", "type", "withdrawnAt");
