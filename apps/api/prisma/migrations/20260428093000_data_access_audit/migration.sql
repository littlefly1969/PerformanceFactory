CREATE TABLE IF NOT EXISTS "DataAccessAudit" (
  "id" TEXT NOT NULL,
  "actorId" TEXT NOT NULL,
  "actorRole" TEXT NOT NULL,
  "targetUserId" TEXT NOT NULL,
  "resource" TEXT NOT NULL,
  "action" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "DataAccessAudit_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "DataAccessAudit_targetUserId_createdAt_idx"
  ON "DataAccessAudit"("targetUserId", "createdAt");

CREATE INDEX IF NOT EXISTS "DataAccessAudit_actorId_createdAt_idx"
  ON "DataAccessAudit"("actorId", "createdAt");

CREATE INDEX IF NOT EXISTS "DataAccessAudit_resource_createdAt_idx"
  ON "DataAccessAudit"("resource", "createdAt");
