CREATE TABLE "AiCycleHistorySummary" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "scope" TEXT NOT NULL,
    "areaId" TEXT,
    "specializationId" TEXT,
    "targetLabel" TEXT NOT NULL,
    "summaryText" TEXT NOT NULL,
    "summaryJson" JSONB,
    "sourceHash" TEXT NOT NULL,
    "coveredVersionsJson" JSONB NOT NULL,
    "provider" TEXT NOT NULL,
    "model" TEXT NOT NULL,
    "promptVersion" TEXT NOT NULL,
    "promptHash" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AiCycleHistorySummary_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "AiCycleHistorySummary_userId_scope_areaId_updatedAt_idx" ON "AiCycleHistorySummary"("userId", "scope", "areaId", "updatedAt");
CREATE INDEX "AiCycleHistorySummary_userId_scope_specializationId_updatedAt_idx" ON "AiCycleHistorySummary"("userId", "scope", "specializationId", "updatedAt");

ALTER TABLE "AiCycleHistorySummary" ADD CONSTRAINT "AiCycleHistorySummary_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
